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
const parse = require('node-html-parser').parse;
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
		'&lsquo;': '‘',
		'&rsquo;':'’',
		'&ndash;': '–',
		'&mdash;':'—',
		'&ldquo;': '“',
		'&rdquo;': '”',	
		'&deg;': '°',	
		'&ntilde;': 'Ñ',		
		
	};
	return str.replace(new RegExp(_.keys(map).join('|'), 'g'), function(m) {return map[m];});
}

const initCustomPages=(dirName)=>{
	const path=dirName;
	const obj={};
	fs.readdirSync(path).forEach(pageName=>{
		const pagePath=path+'/'+pageName;
		const stats=fs.lstatSync(pagePath);
		if (!stats.isDirectory()){
			return;
		}
		obj[pageName]={};
		
		fs.readdirSync(pagePath).forEach(fileName=>{
			const nameArr=fileName.split('.');
			const ext=nameArr.splice(nameArr.length-1, 1)[0];
			const id=nameArr.join('.');
			if (ext==='html'){
				obj[pageName][id]=fs.readFileSync(pagePath+'/'+fileName, 'UTF-8');
			}
			if (ext==='jpg'){
				obj[pageName][id]=pagePath+'/'+fileName;
			}	
			if (ext==='json'){
				obj[pageName][id]=require(pagePath+'/'+fileName);
			}			
			if (ext==='txt'){
				obj[pageName][id]=fs.readFileSync(pagePath+'/'+fileName, 'UTF-8').split('\n');
			}	
		})
	})
	return obj;
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
	await callback(array[index], index, array);
  }
}

const downloadFile=(url)=>{
	return new Promise((success, error)=>{
		//url=url.replace('https', 'http');
		//console.log(url);
		const worker=url.indexOf('https')===0 ? https : http;
		url=url.replace('app.greenninja.org', 'app.greenninja.us');
		url=url.replace('app.ngssgreenninja.org', 'app.greenninja.us');		
		console.log(url);
//		return;
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

const imageInfo=async (path, rotateLandscapes)=>{		
	//console.log(path);
	const img=await Jimp.read(path);
	if (rotateLandscapes && img.bitmap.height<img.bitmap.width){
		await img.rotate(90).write(path);
	}
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
	//console.log(destPath);
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
			text=(text || '').replace(/[\s]*[\d]+[\s]*$/g, '');
			slides.push({
				imagePath: saveDir+'/'+fileName,
				slideNum,
				text,
			})
		}
		//console.log(fileName);
	})
	return _.sortBy(slides, s=>s.slideNum);
}

const cleanUpHTML=(html) => {
	let res=(html || '')
		.replace(/(<a([^>]+)>)/ig, "")
		.replace(/(<\/a>)/ig, "")
		//.replace(/\n/ig, "")
		.replace(new RegExp('<\s*span style="font-weight: 400;"[^>]*>(.*?)<\s*/\s*span>', 'ig'), (match, str)=>{
			//console.log('regexp', match, str);
			return str;
		})
		;
	//console.log(res);
	if (res.indexOf('<')<0){
		res='<p>'+res+'</p>';
	}
	return res;

}

const parseHTMLIntoBlocks=async(text, params, blocks)=>{
	let textNodes=[];
	if (text.tagName==='p' || 1){
		await asyncForEach(text.childNodes, async(node)=>{
			if (node.tagName!=='img'){
				textNodes.push(node);
			}
			else {
				let path=await downloadFile(node.getAttribute('src'));
				//path=await convertImage(path, 'jpeg');
				const imgInfo=await imageInfo(path);
			
				if (textNodes.length){
					blocks.push({
						type: 'p',
						value: textNodes,
						isHtml: true,
						parentEl: text,
						params
					});
					textNodes=[];
				}
			
			
				blocks.push({
					type: 'image',
					value: path,
					heigth: getImgPropHeigth(imgInfo, 465)
				});
			
			}
		})
	}
	
	if (textNodes.length){
		blocks.push({
			type: 'p',
			value: textNodes,
			parentEl: text,
			isHtml: true,
			params,
		});
		textNodes=[];
	}
}
const processObjectFieldsIntoBlocks=async(object, fields, blocks)=>{
	return await asyncForEach(fields, async(item)=>{
		if (item.field && (!object[item.field] || !object[item.field].trim())){
			return;
		}
	
		if (item.title){
			blocks.push(_.extend(item.params || {}, {
				type: item.headerType || 'h2',
				value: item.title,
				rightText: item.titleRight
			}))
		}
	
		const root=parse(cleanUpHTML(object[item.field]));
		const nodes=item.paragraphsToPull ? root.childNodes.slice(0, item.paragraphsToPull) : root.childNodes;
		//console.log(nodes, item);
		await asyncForEach(nodes, async (el, index)=>{
			const params=item.params || {};
			if (el.tagName==='ul' && root.childNodes[index+2] && root.childNodes[index+2].tagName==='div'){
				//console.log('el.tagName', el.tagName, root.childNodes[index+2].tagName);
				el.childNodes[el.childNodes.length-2].addSpaceAfter=false;
			}
			//console.log(_.keys(params), el.text);
			
			await parseHTMLIntoBlocks(el, params, blocks);
		});
		if (item.breakAfter){
			blocks.push({
				type: 'pageBreak'
			})
		}
		if (item.lineAfter){
			blocks.push({
				type: 'line'
			})
		}
	});
}

const getImgInfoAndRotate=async(path)=>{
	return await imageInfo(path, true);
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
	convertPptxPdf,
	parseHTMLIntoBlocks,
	processObjectFieldsIntoBlocks,
	cleanUpHTML,
	initCustomPages,
	getImgInfoAndRotate
};