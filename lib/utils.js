const fs = require('fs');
const https = require('https');
const http = require('http');
const _ = require('lodash');
const Jimp = require('jimp');
//const PDF2Pic = require("pdf2pic");
const mysql = require('mysql2/promise');
const hasha = require('hasha');
const config = require('../config.json');
const shell = require('shelljs');
const { PDFImage } = require("pdf-image");
//const { PDFNet } = require('@pdftron/pdfnet-node');

const pool =  mysql.createPool(config.db);
//const db=pool.promise();

const dbQuery=async (query, params)=>{
	const queryStr=query.join(' ');
	const tmpdest=__dirname+'/../tmp/data/'+hasha(queryStr+JSON.stringify(params)).substr(0, 10)+'.json';
		
	if (fs.existsSync(tmpdest)){
		return require(tmpdest);
		return;
	}
	
	const res=(await pool.query(query.join(' '), params))[0];
	fs.writeFileSync(tmpdest, JSON.stringify(res, null, 4));
	return res;
}

const closeDbConnection=async ()=>{
	await pool.end();
}

const decodeHtml=(str)=>
{
	var map =
	{
		'&amp;': '&',
		'&lt;': '<',
		'&gt;': '>',
		'&quot;': '"',
		'&#039;': "'",
		'&nbsp;': " ",
		'&rsquo;':'’',
		'&ndash;': '—'
	};
	return str.replace(new RegExp(_.keys(map).join('|'), 'g'), function(m) {return map[m];});
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
	await callback(array[index], index, array);
  }
}

const downloadFile=(url)=>{
	return new Promise((success, error)=>{
		//url=url.replace('https', 'http');
		console.log(url);
		const worker=url.indexOf('https')===0 ? https : http;
		
		const urlArr=url.split('/');
		const filename=urlArr[urlArr.length-1];
		const dest='tmp/'+filename;
		
		if (fs.existsSync(dest)){
			success(dest);
			return;
		}
		
		var filestream = fs.createWriteStream(dest);

		var request = worker.get(url, function(response) {
			response.pipe(filestream);
		});

		filestream.on('finish', function() {
			filestream.close();  // close() is async, call cb after close completes.
			success(dest);
		});

		// check for request error too
		request.on('error', function (err) {
			console.log(err);
			//fs.unlink(dest);
			error(err);
		});

		filestream.on('error', function(err) { // Handle errors
			console.log(err);
			//fs.unlink(dest); // Delete the file async. (But we don't check the result)
			error(err);
		});
	})
}

const convertImage=async (path, toFormat)=>{
	const pathArr=path.split('.');
	const ext=pathArr[pathArr.length-1];
	
	const newName=path.replace('.'+ext, '.'+toFormat);
	
	const res=await Jimp.read(path)
	  .then(img => {
		//console.log(img);
		return img
		  //.resize(256, 256) // resize
		  //.quality(60) // set JPEG quality
		  //.greyscale() // set greyscale
		  .write(newName); // save
	  })
	  .catch(err => {
		console.error(err);
	  });
	//console.log(res);
	return newName;
}

const imageInfo=async (path)=>{		
	console.log(path);
	const img=await Jimp.read(path);
	//console.log(JSON.stringify(res, null, 4));
	return img.bitmap;
}

const getImgPropHeigth=(img, width)=>{
	return width*img.height/img.width;
}

const convertPdf=async (path, params)=>{
	const pathArr=path.split('/');
	const fileName=pathArr[pathArr.length-1];
	
	const newName=fileName.replace('.pdf', '-0.jpg');
	const saveDir='tmp/';
	let destPath=saveDir+newName;
	
	if (fs.existsSync('../'+destPath)){
		//return destPath;
	}
	/*
	const doc = await PDFNet.PDFDoc.createFromFilePath(__dirname+'/../'+path);
	
	await PDFNet.Convert.docToSvg(doc, '..'+destPath + ".svg");
	
	
	const tiff_options = new PDFNet.Convert.TiffOutputOptions();
	tiff_options.setDPI(200);
	tiff_options.setDither(true);
	tiff_options.setMono(true);
	await PDFNet.Convert.fileToTiff(filename, output_filename + ".tiff", tiff_options)
	*/
	
	var pdfImage = new PDFImage(__dirname+'/../'+path, {
		convertExtension: 'jpg',
		graphicsMagick: true,
		convertOptions: {
			"-resize": "2000x2000",
			"-quality": "100"
		}
	});
	destPath=await pdfImage.convertFile();
	console.log(destPath);
	/*
	.then(function (imagePath) {
	  // 0-th page (first page) of the slide.pdf is available as slide-0.png
	  fs.existsSync("/tmp/slide-0.png") // => true
	});
	*/
	/*
	const pdf2pic = new PDF2Pic({
	  density: 300,           // output pixels per inch
	  savename: newName,   // output file name
	  savedir: __dirname+'..'+saveDir,    // output file location
	  format: "jpg",          // output file format
	  size: "600x600"    
	});
 	console.log(__dirname+'/../'+path);
	await pdf2pic.convert(__dirname+'/../'+path);
	*/
	return destPath;
}

convertPptxPdf=async (path, file)=>{
	const saveDir=__dirname+'/../tmp/pptx-export/'+file.fileName;
	const notesTextFileName=file.fileName+'_presenter_notes.txt';
	
	if (!fs.existsSync(saveDir)){
		shell.mkdir('-p', saveDir);
		if (file.type==='pptx'){
			shell.exec('python '+__dirname+'/pptx-export-notes.py -p '+__dirname+'/../'+path);
			shell.mv('-n', __dirname+'/../tmp/'+notesTextFileName, saveDir);
		}	
		shell.exec('pptx2pdf '+__dirname+'/../'+path+' --png --output-dir="'+saveDir+'"');
	}
	
	const notes=file.type==='pptx' ? fs.readFileSync(saveDir+'/'+notesTextFileName, 'UTF-8').split('\n') : [];
	const slides=[];
	
	fs.readdirSync(saveDir).forEach(fileName=>{
		const nameArr=fileName.split('.');
		const ext=nameArr[nameArr.length-1];
		if (ext==='png'){
			const numMatch=fileName.match(/([\d]+).png/);
			const slideNum=numMatch && numMatch[1] ? parseInt(numMatch[1])+1 : 1;
			let text=slideNum > 1 ? notes[notes.indexOf('Slide '+(slideNum-1))+1] : '';
			if (parseInt(text)==text){
				text=''
			}
			slides.push({
				imagePath: saveDir+'/'+fileName,
				slideNum,
				text,
			})
		}
		console.log(fileName);
	})
	return _.sortBy(slides, s=>s.slideNum);
}

module.exports = {
	decodeHtml,
	asyncForEach,
	downloadFile,
	convertImage,
	imageInfo,
	getImgPropHeigth,
	dbQuery,
	closeDbConnection,
	convertPdf,
	convertPptxPdf
};