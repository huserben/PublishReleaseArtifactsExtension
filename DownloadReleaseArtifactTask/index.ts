import tl = require('azure-pipelines-task-lib/task');
import fs = require('fs');
import path = require('path');
import * as devopsapi from "azure-devops-node-api";
import unzipper = require('unzipper');

async function run() {
   try {

      var defaultWorkingDirectory = `${process.env["SYSTEM_DEFAULTWORKINGDIRECTORY"]}`;

      var logsFolder: string = path.join(defaultWorkingDirectory, 'DownloadReleaseArtifactTask');
      var artifactName: string = getVariable('artifactName', true);
      var artifactStorageLocation: string = getVariable('artifactStorageLocation', true);
      var unzipInCaseOfZip: boolean = tl.getBoolInput('unzipFile', true);
      var publishedInMultiConfigurationAgent: boolean = tl.getBoolInput('publishedInMultiConfigurationAgent', true);

      console.log(`Will store logs in ${logsFolder}`);
      console.log(`Looking for Artifact with the name ${artifactName}`);
      console.log(`Matching Artifact will be copied to ${artifactStorageLocation}`);

      if (fs.existsSync(logsFolder)) {
         console.log(`Logs were already downloaded at ${logsFolder}`);
      }
      else {
         console.log(`No existing Logs found - will initiating download...`)

         fs.mkdirSync(logsFolder, { recursive: true });

         await downloadLogsAsync(logsFolder);

         console.log('Successfully downloaded logs');
      }

      console.log('Looking for artifact...');

      console.log("Found following matching artifacts:")
      var matchingFiles: string[] = findMatchingArtifacts(logsFolder, artifactName);

      var artifactPath: string = "";

      if (matchingFiles.length < 1) {
         console.log("No Artifacts found - will fail task");
         tl.setResult(tl.TaskResult.Failed, "No matching artifact found");
      }
      else {
         if (matchingFiles.length > 1) {
            console.log("Multiple Artifacts found that match - will try to find best match...");
            var currentAttempt: string = `${process.env["RELEASE_ATTEMPTNUMBER"]}`;

            var attemptFolderName: string = `Attempt${currentAttempt}`;

            console.log(`Current Deployment is the ${currentAttempt} attempt - will prefer artifacts from this attempt...`);
            var artifactsMatchingAttempt: string[] = [];

            matchingFiles.forEach(matchingFile => {
               if (matchingFile.includes(attemptFolderName)) {
                  artifactsMatchingAttempt.push(matchingFile);
                  console.log(`${matchingFile} is matching current attempt`);
               }
            });

            if (artifactsMatchingAttempt.length < 1) {
               console.log("No artifact found that matches attempt - will use first artifact");
               artifactPath = matchingFiles[0];
            }
            else {
               if(publishedInMultiConfigurationAgent) {
                  artifactsMatchingAttempt.forEach((artifact, index) => {
                     copyArtifactToStorageLocation(artifact, unzipInCaseOfZip, artifactName, `${artifactStorageLocation}/multi_agent_N-${index}`);
                  });

                  return;
               } 
               else {
                  if (artifactsMatchingAttempt.length == 1){
                     console.log("Found exactly 1 artifact matching the attempt, will continue with this.")
                  }
                  else{
                     console.log("Found multiple artifacts that match attempt - will use first one.")
                  }
               
                  artifactPath = artifactsMatchingAttempt[0];
               }
            }
         }
         else {
            artifactPath = matchingFiles[0];
         }

         copyArtifactToStorageLocation(artifactPath, unzipInCaseOfZip, artifactName, artifactStorageLocation);
      }
   }
   catch (err: ?) {
      tl.setResult(tl.TaskResult.Failed, err.message);
   }
}

function copyArtifactToStorageLocation(artifactPath: string, unzipInCaseOfZip: boolean, artifactName: string, artifactStorageLocation: string) {
   if (!fs.existsSync(artifactStorageLocation)) {
      console.log(`Artifacts Directory ${artifactStorageLocation} does not exist - will be created`);
      fs.mkdirSync(artifactStorageLocation, { recursive: true });
   }

   if (path.extname(artifactPath) === '.zip' && unzipInCaseOfZip) {
      console.log('Artifact is a zip and option to unzip was chosen - will unzip...');
      var folderName: string = path.basename(artifactName).split('.').slice(0, -1).join('.');
      var extractionDirectory: string = path.join(artifactStorageLocation, folderName);
      fs.createReadStream(artifactPath).pipe(unzipper.Extract({ path: extractionDirectory }));
      console.log(`Artifact unzipped to ${extractionDirectory}`);
   }
   else {
      fs.copyFileSync(artifactPath, path.join(artifactStorageLocation, artifactName));
      console.log(`Artifact copied to ${artifactStorageLocation}`);
   }
}

function findMatchingArtifacts(logsFolder: string, artifactName: string) : string[] {
   var matchingFiles: string[] = [];
   var allFiles: [fullPath: string, filePath: string][] = getAllFilesIncludingSubfolders(logsFolder);

   for (const [fullPath, filePath] of allFiles){
      // https://stackoverflow.com/a/4607799/909040
      var fileNameWithoutPrefix = filePath.split(/_(.*)/s)[1]

      if (fileNameWithoutPrefix === artifactName) {
         matchingFiles.push(fullPath);
         console.log(fullPath);
      }
   }


   return matchingFiles;
}

async function downloadLogsAsync(logsFolder: string): Promise<void> {
   var organizationUrl: string = `${process.env["SYSTEM_TEAMFOUNDATIONCOLLECTIONURI"]}`;
   var teamProject: string = `${process.env["SYSTEM_TEAMPROJECTID"]}`;
   var token: string = `${process.env["SYSTEM_ACCESSTOKEN"]}`;
   var releaseId: number = parseInt(`${process.env['RELEASE_RELEASEID']}`);

   console.log('Will get logs for current Relese');
   console.log(`Organization: ${organizationUrl}`);
   console.log(`Team Project ID: ${teamProject}`);
   console.log(`Release ID: ${releaseId}`);

   var accessTokenAccessEnabled: boolean = process.env['SYSTEM_ENABLEACCESSTOKEN']?.toLowerCase() === "true";

   if (!accessTokenAccessEnabled) {
      tl.setResult(tl.TaskResult.Failed, 'OAuth Token could not be used - make sure to allow usage for the job that runs the download task.');
      console.log('Could not read Access Token - failing the Task. Make sure access to Token is allowed in the Agent Phase setting.');
      throw new Error("Could not read Access Token");
   }

   var authHandler = devopsapi.getHandlerFromToken(token);
   var connection: devopsapi.WebApi = new devopsapi.WebApi(organizationUrl, authHandler);
   var releaseapi = await connection.getReleaseApi();
   var logs = await releaseapi.getLogs(teamProject, releaseId);

   return new Promise((resolve, reject) => {

      var stream = logs.pipe(unzipper.Parse());
      stream.on("entry", function (entry) {
         const entryPath = entry.path;
         const filename = path.parse(entryPath).base;
         const fileDir = path.parse(entryPath).dir;
         const parsedFileName = fileDir.replace(/,/g, "_").replace(/:/g, "_");
         const fileExtractDir =  `${logsFolder}/${parsedFileName}`;

         fs.mkdirSync(fileExtractDir, { recursive: true });

         entry.pipe(fs.createWriteStream(`${fileExtractDir}/${filename}`));

      });
      stream.on("close", () => {
         try {
            resolve();
         }
         catch (err) {
            reject(err);
         }
      });
   });
}

function getAllFilesIncludingSubfolders(baseFolder: string): [fullPath: string, fileName: string][] {
   var allFolders: string[] = [];
   getAllSubFolders(baseFolder, allFolders);

   var allFiles: [string, string][] = [];

   allFolders.forEach(folder => {
      fs.readdirSync(folder).forEach(file => {
         var fullPath = path.join(folder, file);
         allFiles.push([fullPath, file]);
      })
   });

   return allFiles;
}

function getAllSubFolders(baseFolder: string, folderList: string[] = []): void {

   let folders: string[] = fs.readdirSync(baseFolder).filter(file => fs.statSync(path.join(baseFolder, file)).isDirectory());
   folders.forEach(folder => {
      folderList.push(path.join(baseFolder, folder));
      getAllSubFolders(path.join(baseFolder, folder), folderList);
   });
}

function getVariable(variableName: string, isRequired: boolean): string {
   const variable: string | undefined = tl.getInput(variableName, isRequired);
   if (variable === null || variable === undefined) {
      if (isRequired) {
         tl.setResult(tl.TaskResult.Failed, 'Bad input was given');
         throw new Error(`Variable ${variableName} not found`);
      }
      else {
         return "";
      }
   }

   return variable;
}

run();