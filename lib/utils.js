﻿const fs = require('fs');
const https = require('https');
const http = require('http');
const _ = require('lodash');
const Jimp = require('jimp');
//const PDF2Pic = require("pdf2pic");
const mysql = require('mysql2/promise');
const hasha = require('hasha');
const config = require('../config.json');
const gdSecret = require('../.google-credentials.json');
const shell = require('shelljs');
const parse = require('node-html-parser').parse;
const superagent = require('superagent');
const { PDFImage } = require("pdf-image");
const gdriveSync = require('sync-gdrive');
const gdriveFolder = __dirname+'/../gdrive';
const PPTXCompose = require('pptx-compose').default;
const extract = require('extract-zip');

const composer = new PPTXCompose({});

//const { PDFNet } = require('@pdftron/pdfnet-node');

const pool =  mysql.createPool(config.db);
const imgInfoJogPath=__dirname+'/../tmp/pptx-export/imgInfoLog.json';
//const db=pool.promise();
const imgInfoLog=fs.existsSync(imgInfoJogPath) ? require(imgInfoJogPath) : {};

const saveImgLog=()=>{
	fs.writeFileSync(imgInfoJogPath, JSON.stringify(imgInfoLog, null, 4), 'UTF-8');
}

const queuePath=__dirname+'/../queue.json';

const loadQueue=()=>{
	return fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath), 'UTF-8') : [];
}
const saveQueue=(data)=>{
	fs.writeFileSync(queuePath, JSON.stringify(data, null, 4), 'UTF-8');
}

const GDFolderSync=async (folderId, destFolderName)=>{
	await gdriveSync.syncGDrive(folderId, gdriveFolder+'/'+destFolderName, {
		clientEmail: gdSecret.client_email,
  		privateKey: gdSecret.private_key
	}, {
		
	});
}

const dbQuery=async (query, params)=>{
	const queryStr=query.join(' ');
	const tmpdest=__dirname+'/../tmp/data/'+hasha(queryStr+JSON.stringify(params)).substr(0, 10)+'.json';
		
	if (fs.existsSync(tmpdest) && !config.alwaysFlushDBCache){
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
		'&frac14;': '¼',
		'&prime;': '′',
		'&Prime;': '″',
		'\n':'',
		'&shy;': ' ',
		'&frac12;': '½',
		'&rarr;': '<symbol>➞</symbol>',
		'&hellip;': '…',
		'&ordm;': '°',
		'&times;': '×',
		'&sup2;': '²',
		'&sup3;': '³',
		'&aacute;': 'á'
	};
	return str.replace(new RegExp(_.keys(map).join('|'), 'g'), function(m) {return map[m];});
}

const initCustomPages=async (dirName)=>{
	const path=dirName;
	const obj={};
	await asyncForEach (fs.readdirSync(path), async (pageName)=>{
		const pagePath=path+'/'+pageName;
		const stats=fs.lstatSync(pagePath);
		if (pageName.indexOf('.json')>0){
			obj[pageName.replace('.json', '')]=require(pagePath);
			return;
		}
		if (pageName.indexOf('.txt')>0){
			obj[pageName.replace('.txt', '')]=fs.readFileSync(pagePath, 'UTF-8').split('\n').map(str=>str.trim());
			return;
		}
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

const flushCache=async (dbOnly)=>{
	const tmpPath=__dirname+'/../tmp';
	if (dbOnly) {
		shell.rm('-rf', tmpPath+'/data');
		fs.mkdirSync(tmpPath+'/data');
		return;
	}
	shell.rm('-rf', tmpPath);
	shell.rm('-rf', gdriveFolder);
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
		
		let urlArr=url.split('/');
		let filename=urlArr[urlArr.length-1];
		let dest='tmp/'+filename.replace(' ', '-');
		if (url.indexOf('images/')===0){
			url='https://app.greenninja.org/'+url;
		}
		
		if (url.indexOf('http')!==0){
			//error('url is incorrect');
			const ext=url.indexOf('png;base64')>0 ? 'png' : 'jpg'
			const base64Data = url
				.replace(/^data:image\/png;base64,/, "")
				.replace(/^data:image\/jpeg;base64,/, "");
			filename=hasha(url).substr(0, 10)+'.'+ext;
			dest='tmp/'+filename;
			fs.writeFileSync(dest, base64Data, 'base64');
			//console.log(url);
			
			//return;
		}
		console.log(url);
//		return;
		
		
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
		await img.rotate(90).write(path+'_rotated');
		imgInfoLog[path].rotated=true;
		imgInfoLog[path].rotatedPath=path+'_rotated';
	}
	saveImgLog();
	return imgInfoLog[path];
}

const getImgPropheight=(img, width)=>{
	return width*(img.rotated ? img.width/img.height : img.height/img.width);
}
const getImgPropWidth=(img, height)=>{
	return height*img.width/img.height;
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

convertPptxPdf=async (path, file, useAbsolutePath, lowQuality)=>{
	const filename=file.fileName.replace(' ', '-');
	const saveDir=__dirname+'/../tmp/pptx-export/'+filename;
	const pathArr=path.split('/');
	const notesTextFileName=filename+'_presenter_notes.txt';
	const pathPrefix=useAbsolutePath ? '' : __dirname+'/../';
	const pptx2pdf=config.pptx2pdfCommand;
	let resize=2400;
	let density=600;
	if (lowQuality){
		resize=1200;
		density=200;
	}
	//console.log(path);

	let cmdPrefix='';
	
	if (!fs.existsSync(saveDir)){
		shell.mkdir('-p', saveDir);
		if (useAbsolutePath){
			cmdPrefix='cd "'+pathArr.splice(0, pathArr.length-1).join('/')+'" && ';
			path=pathArr.splice(pathArr.length-1, 1)[0];
		}
		if (file.type==='pptx'){
			//const pptx = await composer.toJSON(pathPrefix+path);
			//console.log('PPTXCompose', JSON.stringify(pptx, null, 4));
			await extract(pathPrefix+path, { dir: saveDir+'/extracted' });
			//shell.exec('python '+__dirname+'/pptx-export-notes.py -p "'+pathPrefix+path+'"');
			
			//shell.mv('-n', __dirname+'/../tmp/'+notesTextFileName, saveDir);
		}	
		console.log(cmdPrefix+pptx2pdf+' "'+pathPrefix+path+'" --png --output-dir="'+saveDir+'" --resize='+resize+' --density='+density+'');
		shell.exec(cmdPrefix+pptx2pdf+' "'+pathPrefix+path+'" --png --output-dir="'+saveDir+'" --resize='+resize+' --density='+density+'');
	}
	const notes=[];
	if (file.type==='pptx'){
		if (!fs.existsSync(saveDir+'/extracted')){
			await extract(pathPrefix+path, { dir: saveDir+'/extracted' });
		}
		if (fs.existsSync(saveDir+'/extracted/ppt/notesSlides')){
			fs.readdirSync(saveDir+'/extracted/ppt/notesSlides').forEach(fileName=>{
				const nameArr=fileName.split('.');
				const ext=nameArr[nameArr.length-1];
				if (ext==='xml'){
					let slideNum=parseInt(fileName.replace('notesSlide', '').replace('.xml', ''));
					const xml=fs.readFileSync(saveDir+'/extracted/ppt/notesSlides/'+fileName, 'UTF-8');
					const rels=fs.readFileSync(saveDir+'/extracted/ppt/notesSlides/_rels/'+fileName+'.rels', 'UTF-8');
					//console.log('xml', xml);
					const root=parse(xml);
					const bodies=root.querySelectorAll('p:txBody');
					const slideNumElement=root.querySelector('[type="slidenum"]');
					if (slideNumElement){
						slideNum=parseInt(slideNumElement.text);
						console.log('slideNumElement', slideNumElement.text);
					}
					if (rels){
						const slideNumRel = rels.match(/Target\=\"..\/slides\/slide([\d]+)\.xml/)[1];
						if (slideNumRel && parseInt(slideNumRel)!==slideNum){
							slideNum=parseInt(slideNumRel);
						}
					}
					let str='';
					const replaceNoteText=(text)=>{
						return text ? text.replace('    ', ' ').replace('The NEED Project 2014', '').trim() : '';
					}
					bodies.forEach(body=>{
						body.childNodes.forEach(node=>{
							if (node.tagName==='a:p' && replaceNoteText(node.text) && parseInt(replaceNoteText(node.text))!=node.text){
								//console.log(node.text);
								str+='<p>';
								node.childNodes.forEach(node=>{
									const text=replaceNoteText(node.text);
									if (text){
										console.log('noteText', text);
										const styleNode=node.querySelector('a:rPr');
									
										let tag='span';
										if (styleNode){
											//console.log('styleNode', styleNode.getAttribute('i'), styleNode);
											if (styleNode.getAttribute('i') && styleNode.getAttribute('i')==1){
												tag='em';
											}
											if (styleNode.getAttribute('b') && styleNode.getAttribute('b')==1){
												tag='strong';
											}
										}
										str+='<'+tag+'>'+text+'</'+tag+'>';
									}
									else {
										const bullet=node.querySelector('a:buChar');
										if (bullet){
											str+=bullet.getAttribute('char').replace(/●/g, '•')+' ';
										}
									}
								});
								str+='</p>';
							
							}
						});
					})
					
					//console.log(str);
					notes[slideNum]=str;
					//console.log(body);
				}
			});
		}
		
	}
	
	
	//file.type==='pptx' ? fs.readFileSync(saveDir+'/'+notesTextFileName, 'UTF-8').split('\n') : [];
	const slides=[];
	//console.log(notes);
	
	fs.readdirSync(saveDir).forEach(fileName=>{
		const nameArr=fileName.split('.');
		const ext=nameArr[nameArr.length-1];
		if (ext==='png'){
			const numMatch=fileName.match(/([\d]+).png/);
			const slideNum=numMatch && numMatch[1] ? parseInt(numMatch[1])+1 : 1;
			let text=notes[slideNum] || '';
			//console.log(notes.indexOf('Slide '+(slideNum-1))+1, text, slideNum)
			if (parseInt(text)==text){
				text=''
			}
			
			text=(text || '').replace(slideNum+'The NEED Project', '').replace(/[\s]*[\d]+[\s]*$/g, '');
			if (text.trim()=='Slide' || text.trim()=='Slide '+slideNum){
				text=''
			}
			console.log(text.replace(/• $/gmi, "\nsdfsdf• "));
			slides.push({
				imagePath: saveDir+'/'+fileName,
				slideNum,
				text,
			});
			//console.log('Converted:', '"'+text+'"')
		}
		//console.log(fileName);
	})
	//console.log(slides);
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
		.replace(/\&nbsp\;/ig, " ")
		.replace(/\n/ig, " ")
		.replace(/<\/p> <p>/ig, "</p><p>")
		.replace(/\<br \/\>/ig, "<br />\n")
		//.replace(/\n/ig, "")
		//.replace(new RegExp('<\s*span style="font-weight: 400;"[^>]*>(.*?)<\s*/\s*span>', 'ig'), (match, str)=>{
			//return str;
		//})
		;
	//console.log(res);
	if (res.indexOf('<')!==0){
		res='<p>'+res+'</p>';
	}
	
	
	const root = parse(res);
	const tboxes=root.querySelectorAll('div.tips-box');
	tboxes.forEach(tbox=>{
		tbox.tagName='tips-box';	
	})

	root.childNodes.forEach(node=>{
		if (node.tagName==='div'){
			node.tagName='p';
		}
	})
	
	if (res.indexOf('of this lesson is devoted') >0){
		//console.log('html0:'+root.toString().replace(/<\/?div[^>]*>/g, "").trim());
	}
	
	res=root/*.removeWhitespace()*/.toString()
		.replace(/<\/?div[^>]*>/g, "")
		.replace(/<\/p> <p>/ig, "</p><p>")
		.replace(/\>[\s]+\<img/ig, "><img")
		.replace(/ul\> \<p\>/ig, "ul><p>")
		.replace(/li\> \<\/ul/ig, "li></ul")
		.replace(/em\> \<ul/ig, "em><ul")
		.replace(/ul\> \<li/ig, "ul><li")
		.replace(/\> \<span style\=\"font-weight\: 400\;\"\>/ig, '><span style="font-weight: 400;"> ')
		
		.trim()//.replace(/\<div\>/ig, "").replace(/\<\/div\>/ig, " ");
	if (res.indexOf('<')!==0){
		res='<p>'+res+'</p>';
	}
	if (res.indexOf('and rotation as well as the orbit of the moon around Earth') >0){
		console.log('html:'+res);
	}
	//console.log('html:'+res);
	return decodeHtml(res);

}

const parseHTMLIntoBlocks=async(text, params, blocks)=>{
	let textNodes=[];
	let images=[];
	proceedImages=()=>{
		if (!images.length){
			return;
		}
		if (images.length===1){
			const htmlWidth=images[0].htmlWidth;
			let width=htmlWidth && htmlWidth < 100 ? htmlWidth : 465;
			if (htmlWidth < (params.imgParams && params.imgParams.width ? 465 :680) && htmlWidth>=100){
				width=htmlWidth/1.5;
			}
			console.log(width);
			if (params.imgParams && params.imgParams.width > width){
				params.imgParams.width=width;
			}
			else if (params.imgParams && params.imgParams.width && htmlWidth<430 && images[0].imgInfo.width*2 < width) {
				width=params.imgParams.width;
			}
			else if (images[0].imgInfo.width*2 < width){
				width=images[0].imgInfo.width;
				params.imgParams.width=width;
			}
			let height=getImgPropheight(images[0].imgInfo, width);
			if (height>700){
				width=getImgPropWidth(images[0].imgInfo, 600);
				params.imgParams.width=width;
			}
			if (params.imgParams){
				params.imgParams.width=width;
			}
			
			console.log('htmlWidth', images[0].htmlWidth, params.imgParams, width, height)
			blocks.push({
				type: 'image',
				value: images[0].path,
				height: getImgPropheight(images[0].imgInfo, width),
				width,
				stuckWithPrevious: true, 
				...(params.imgParams || {})
			});
		}
		else {
			let x=70;
			const value=images.map(img=>{
				let width=img.htmlWidth ? img.htmlWidth/1.5 : 465;
				if (images.length > 1 && width > 250){
					width=220;
				}
				if (images.length > 2 && width > 100){
					width=140;
				}
				const obj={
					path: img.path,
					height: getImgPropheight(img.imgInfo, width),  
					width,
					x
				};
				x+=width+18;
				if (x>465){
					x=80;
				}
				return obj;
			});
			blocks.push({
				type: 'images',
				value,
				width: value[0].width,
				firstRowHeight: value[0].height,
				...(params.imgParams || {})
			});
			//console.log('value', value);
		}
		
		images=[];
	}
	const proceedTexts=()=>{
		if (textNodes.length){
			blocks.push({
				type: 'p',
				value: textNodes,
				isHtml: true,
				parentEl: text,
				stuckWithPrevious: params ? params.stuckWithPrevious : false,
				fitToPage: params ? params.fitToPage : false,
				params
			});
			textNodes=[];
		}
	}
	if (text.tagName==='p' || 1){
		await asyncForEach(text.childNodes, async(node)=>{
			//console.log(node);
			if (node.tagName!=='img'){
				if (images.length){
					proceedTexts();
					proceedImages();
				}
				if (node.text && node.text.trim() || node.tagName==='br'){
					textNodes.push(node);
				}
			}
			else {
				let path=await downloadFile(node.getAttribute('src'));
				const imgInfo=await imageInfo(path);
				images.push({
					path, 
					imgInfo,
					htmlWidth:node.getAttribute('width'),
					htmlHeight:node.getAttribute('height'),
				});
				//console.log('images', images);
			}
		})
	}
	
	proceedTexts();
	proceedImages();
}
const parseHtml=(text)=>{
	return parse(cleanUpHTML(text));
}
const processObjectFieldsIntoBlocks=async(object, fields, blocks)=>{
	return await asyncForEach(fields, async(item)=>{
		if (item.field && (!object[item.field] || !object[item.field].trim()) && !item.showHeaderInAnyCase){
			return;
		}
	
		if (item.title){
			blocks.push(_.extend(_.clone(item.params) || {}, {
				type: item.headerType || 'h2',
				value: item.title,
				rightText: item.titleRight
			}))
		}
		
		if (item.field && (!object[item.field] || !object[item.field].trim())){
			return;
		}
	
		const root=parseHtml(object[item.field]);
		const nodes=item.paragraphsToPull ? root.childNodes.slice(0, item.paragraphsToPull) : root.childNodes;
		//console.log(nodes, item);
		await asyncForEach(nodes, async (el, index)=>{
			const params=_.clone(item.params) || {};
			if (el.tagName==='ul' && root.childNodes[index+2] && root.childNodes[index+2].tagName==='div'){
				//console.log('el.tagName', el.tagName, root.childNodes[index+2].tagName);
				//el.childNodes[el.childNodes.length-2].addSpaceAfter=false;
			}
			if (el.tagName==='p' && nodes[index-1] && nodes[index-1].tagName==='p'){
				params.marginTop=0.4;
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
	getImgPropheight,
	getImgPropWidth,
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
	flushCache,
	GDFolderSync,
	loadQueue,
	saveQueue,
	imgInfoJogPath
};