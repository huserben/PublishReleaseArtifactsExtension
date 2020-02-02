# Publish Release Artifacts Extension

# Overview
The tasks contained in this package allow on one side to upload files to the logs of the release to create _Release Artifacts_.
Another task allows to fetch those artifacts again, for example if they are needed in a different agent phase.

## Publish Release Artifact Task
The _Publish Release Artifact Task_ is very straight forward and only needs one parameter to work properly.
Specify the path to the file or the folder you want to have uploaded to the logs.

TODO: Image here

In case a folder is specified, this folder will be zipped and is available later on as _foldername.zip_ in the logs.

## Download Release Artifact Task
For the the download task to work properly, the Pipeline **must** have access to the OAuth Token, otherwise the task will fail:
TODO: Image here

The download task has 3 configuration options.
First of all the name of the artifact we want to download must be specified. This matches the name of the file used in the _Publish Task_. If you specified a folder, you have to specify the resulting zip file, so _foldername.zip_.

The second option let's you specify where the artifact should be copied to.

The last option is optional and only has effect when the artifact is a zip file. You can chose whether you want to unzip it which will result in a new folder with the name of the zip at the drop location or if you want to keep it in a _zipped_ state and copy the full file to the drop location.

TODO: Image


## Icons
Icons where made by Kiranshastry from [](www.flaticon.com)