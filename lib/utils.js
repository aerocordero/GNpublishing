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
const superagent = require('superagent');
const { PDFImage } = require("pdf-image");
//const { PDFNet } = require('@pdftron/pdfnet-node');

const pool =  mysql.createPool(config.db);
const imgInfoJogPath=__dirname+'/../tmp/pptx-export/imgInfoLog.json';
//const db=pool.promise();
const imgInfoLog=fs.existsSync(imgInfoJogPath) ? require(imgInfoJogPath) : {};

const saveImgLog=()=>{
	fs.writeFileSync(imgInfoJogPath, JSON.stringify(imgInfoLog, null, 4), 'UTF-8');
}

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

const initCustomPages=async (dirName)=>{
	const path=dirName;
	const obj={};
	await asyncForEach (fs.readdirSync(path), async (pageName)=>{
		const pagePath=path+'/'+pageName;
		const stats=fs.lstatSync(pagePath);
		if (!stats.isDirectory()){
			return;
		}
		obj[pageName]={};
		await asyncForEach (fs.readdirSync(pagePath), async (fileName)=>{
			const nameArr=fileName.split('.');
			const ext=nameArr.splice(nameArr.length-1, 1)[0];
			const id=nameArr.join('.');
			if (ext==='html'){
				obj[pageName][id]=fs.readFileSync(pagePath+'/'+fileName, 'UTF-8');
			}
			if (ext==='jpg' || ext==='png'){
				obj[pageName][id]=pagePath+'/'+fileName;
			}	
			if (ext==='json'){
				obj[pageName][id]=require(pagePath+'/'+fileName);
			}			
			if (ext==='txt'){
				obj[pageName][id]=fs.readFileSync(pagePath+'/'+fileName, 'UTF-8').split('\n');
			}	
			if (ext==='pdf'){
				obj[pageName][id]=await convertPptxPdf(pagePath+'/'+fileName, {
					type:'pdf',
					fileName: fileName.replace('.'+ext, ''),
				}, true);
			}
		});
	})
	return obj;
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
	await callback(array[index], index, array);
  }
}

const flushCache=async ()=>{
	const tmpPath=__dirname+'/../tmp';
	shell.rm('-rf', tmpPath);
	fs.mkdirSync(tmpPath);
	fs.mkdirSync(tmpPath+'/pptx-export');
	fs.mkdirSync(tmpPath+'/data');
}

const downloadFile=(url)=>{
	return new Promise((success, error)=>{
		//url=url.replace('https', 'http');
		
		const worker=url.indexOf('https')===0 ? https : http;
		url=url.replace('app.greenninja.org', 'app.greenninja.us');
		url=url.replace('/greenninja.org', '/greenninja.us');
		url=url.replace('app.ngssgreenninja.org', 'app.greenninja.us');		
		//console.log(url);
//		return;
		const urlArr=url.split('/');
		const filename=urlArr[urlArr.length-1];
		const dest='tmp/'+filename.replace(' ', '-');
		
		if (fs.existsSync(dest)){
			console.log('File exists: ', dest);
			success(dest);
			return;
		}
		console.log('Downloading file:', url);
		
		var filestream = fs.createWriteStream(dest);
		superagent.get(url).pipe(filestream);
		
		filestream.on('finish', function () {
			filestream.close();  // close() is async, call cb after close completes.
			success(dest);
		});
		filestream.on('error', function () {
			filestream.close();  // close() is async, call cb after close completes.
			fs.unlink(dest);
			error(err);
		});
		
		
		/*
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
			fs.unlink(dest);
			error(err);
		});

		filestream.on('error', function(err) { // Handle errors
			console.log(err);
			fs.unlink(dest); // Delete the file async. (But we don't check the result)
			error(err);
		});
		*/
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
	if (imgInfoLog && imgInfoLog[path]){
		return imgInfoLog[path];
	}
	
	const img=await Jimp.read(path);
	imgInfoLog[path]={
		height: img.bitmap.height,
		width: img.bitmap.width,
	};
	if (rotateLandscapes && img.bitmap.height<img.bitmap.width){
		await img.rotate(90).write(path);
		imgInfoLog[path].rotated=true;
	}
	saveImgLog();
	return imgInfoLog[path];
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

convertPptxPdf=async (path, file, useAbsolutePath)=>{
	const filename=file.fileName.replace(' ', '-');
	const saveDir=__dirname+'/../tmp/pptx-export/'+filename;
	const pathArr=path.split('/');
	const notesTextFileName=filename+'_presenter_notes.txt';
	const pathPrefix=useAbsolutePath ? '' : __dirname+'/../';
	//console.log(path);
	let cmdPrefix='';
	
	if (!fs.existsSync(saveDir)){
		shell.mkdir('-p', saveDir);
		if (useAbsolutePath){
			cmdPrefix='cd "'+pathArr.splice(0, pathArr.length-1).join('/')+'" && ';
			path=pathArr.splice(pathArr.length-1, 1)[0];
		}
		if (file.type==='pptx'){
			shell.exec('python '+__dirname+'/pptx-export-notes.py -p "'+pathPrefix+path+'"');
			shell.mv('-n', __dirname+'/../tmp/'+notesTextFileName, saveDir);
		}	
		console.log(cmdPrefix+'pptx2pdf "'+pathPrefix+path+'" --png --output-dir="'+saveDir+'"');
		shell.exec(cmdPrefix+'pptx2pdf "'+pathPrefix+path+'" --png --output-dir="'+saveDir+'"');
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
	//console.log(html);
	//const root = parse(html);
	//console.log(root.structure);
	//return;
	
	let res=(html || '')
		.replace(/(<a([^>]+)>)/ig, "")
		.replace(/(<\/a>)/ig, "")
		//.replace(/\n/ig, "")
		//.replace(new RegExp('<\s*span style="font-weight: 400;"[^>]*>(.*?)<\s*/\s*span>', 'ig'), (match, str)=>{
			//return str;
		//})
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
					heigth: getImgPropHeigth(imgInfo, 465),
					...(params.imgParams || {})
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
const parseHtml=(text)=>{
	return parse(cleanUpHTML(text));
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
	
		const root=parseHtml(object[item.field]);
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
	getImgInfoAndRotate,
	parseHtml,
	flushCache
};