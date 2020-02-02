import tl = require('azure-pipelines-task-lib/task');
import fs = require('fs');
import path = require('path');
var zipper = require('zip-local');

async function run() {
   try {
      var artifactPath: string = getVariable('artifactPath', true);

      if (!fs.existsSync(artifactPath)) {
         tl.setResult(tl.TaskResult.Failed, `No file or directory found at ${artifactPath}`);
      }

      if (fs.lstatSync(artifactPath).isDirectory()) {
         console.log(`${artifactPath} is a directory - will zip.`)
         artifactPath = zip_file(artifactPath);
      }
      else {
         console.log(`${artifactPath} is a file - will upload as is.`)
      }

      console.log(`Uploading ${artifactPath} to logs...`);
      console.log(`##vso[task.uploadfile]${artifactPath}`);
      console.log('Finished uploading - task complete')
   }
   catch (err) {
      tl.setResult(tl.TaskResult.Failed, err.message);
   }
}

function zip_file(artifactPath: string): string {
   var artifact_zip: string = `${artifactPath}.zip`;
   zipper.sync.zip(artifactPath).compress().save(artifact_zip);
   return artifact_zip;
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