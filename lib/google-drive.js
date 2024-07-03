const {google} = require('googleapis');

class GoogleDriveService {

  constructor(credentials, folderId){
    this.folderId = folderId

    this.OAuth2client = new google.auth.GoogleAuth({
      keyFile: credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    })
    
    this.drive = google.drive({ 
      version: "v3",
      auth: this.OAuth2client
    })

  }

  /**
   * Method responsible for uploading a file to google drive
   * @param {*} filename file name 
   * @param {*} file file path
   * @param {*} mimeType file type
   * @returns google query result
   */
  createFileUpload = async(filename, file, mimeType) => {
    let media = {
      mimeType: mimeType,
      body: file
    }
    try{
      const response = await this.drive.files.create({
        requestBody: {
          name: filename,
          parents: [this.folderId]
        },
        media: media,
      })
      if(response.status == 200){
        return response.data
      }
    }catch(err){
     console.log("🚀 ~ file: google_drive.js ~ line 44 ~ GoogleDriveService ~ createFileUpload=async ~ err", err)
    }
  }
  /**
   * Method responsible for delete a file to google drive
   * @param {*} idFile file id
   */
  deleteFile = async(idFile) => {
    const onDelete = await this.drive.files.delete({
        fileId: idFile
    })
    return onDelete
  }

  /**
   * Method responsible for listing files to google drive
   * @returns google drive files 
   */
  listFiles = async() => {

    const list = await this.drive.files.list()
    const filesDrive = list.data.files

    return filesDrive
  }

  /**
   * Method responsible for create folder in google drive
   * @param {*} nameFolder folder name
   * @returns google query results
   */
  createFolder = async (nameFolder)=>{
      var requestBody = {
        name: nameFolder,
        mimeType: 'application/vnd.google-apps.folder'
    };
    const response = await this.drive.files.create({
      requestBody    
    })

    if(response.status == 200){
      return response.data
    }

  }
}


module.exports = GoogleDriveService;