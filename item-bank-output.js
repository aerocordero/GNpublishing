/*
	node workbook.js --model=<modelId> --unit=<unitId> [--dest-path="<path_to_dest_pdf_file>"] [--first-export] [--flush-cache]
*/

async function main() {
	const mysql = require('mysql2');
	const bluebird = require('bluebird');
	const parse = require('node-html-parser').parse;
	const fs = require('fs');
	const http = require('https');
	const _ = require('lodash');
	const Jimp = require('jimp');
	const argv = require('yargs').argv;
	const Color = require('color');
	const svgpath = require('svgpath');
	const csv=require("csvtojson");

	const language = argv.language;
	const languageId = language==='spanish' ? 2 : 1;
	const customPageFolders={
		1: '1hqsJWKFny-Myf7UiyJOVvpYqt48Em4BZ',
		2: '1T3vSEZoIzH6D6Nu0F2dDEpghgGyJL4RT'
	}
	const phenomenonWord={
		1: 'phenomenon',
		2: 'fenomeno'
	}
	const CPFolderName='workbook'+(languageId >1 ? '_'+language : '');
	console.log('languageId:'+languageId);
	
	const config = require('./config.json');
	
	const {
		decodeHtml,
		asyncForEach,
		downloadFile,
		convertImage,
		imageInfo,
		getImgPropheight,
		dbQuery,
		closeDbConnection,
		convertPdf,
		processObjectFieldsIntoBlocks,
		parseHTMLIntoBlocks,
		cleanUpHTML,
		initCustomPages,
		getImgInfoAndRotate,
		parseHtml,
		flushCache,
		GDFolderSync,
		saveQueue,
		loadQueue,
		convertPptxPdf,
		setDBName
	} = require('./lib/utils');
	const { materialsQtySet } = require('./lib/greenninja');
	const PDFUtilsObj  = require('./lib/pdf-utils');
	
	const queueItemId=argv.queueItemId;
	const disableImages=argv.disableImages;

	const gradeNum=argv.gradeNum;
	const unitNum=argv.unitNum;
	const chapterNum=argv.chapterNum;	

	
	
	const colors={
		unitTitle: '#FF5609',
		green: '#6FAC44',
		lessonGreen: '#1E793C',
		brown: '#634439',
		black: 'black',
		blue: '#26adca'
	}
	const gradeColors={
		'Grade 6': '#FF5609',
		'Grade 7': '#15ADCB',						
		'Grade 8': '#89C440',
	}
	
	const textIdents={
		left: 48,
		top: 60
	}
	
	const fonts={
		regular: 'fonts/mulish/Mulish-Regular.ttf',
		medium: 'fonts/mulish/Mulish-Medium.ttf',
		bold: 'fonts/mulish/Mulish-Bold.ttf',
		semiBold: 'fonts/mulish/Mulish-SemiBold.ttf',
		italic: 'fonts/mulish/Mulish-Italic.ttf',
		boldItalic: 'fonts/mulish/Mulish-BoldItalic.ttf',
		arial: 'fonts/arial-unicode-ms.ttf', 
	}
	const fontsHeading={
		regular: 'fonts/Kodchasan/Kodchasan-Regular.ttf',
		bold: 'fonts/Kodchasan/Kodchasan-Bold.ttf',
		semiBold: 'fonts/Kodchasan/Kodchasan-SemiBold.ttf',
		italic: 'fonts/Kodchasan/Kodchasan-Italic.ttf',
		boldItalic: 'fonts/Kodchasan/Kodchasan-BoldItalic.ttf',
	}
	
	console.log('Connected to the DB');
	
	const modelId=argv.model;//19;
	const unitId=argv.unit;//35;
	const printLessonNum=argv.lesson;
	const gdAssetsPath=config.gdAssetsPath;
	
	//const customPages=initCustomPages(__dirname+'/custom-pages-workbook');
	
	console.log('Loading data...');		
	const leters='ABCDEFGHIJ'.split('');
	//console
	const spreadsheetData=_.sortBy(await csv().fromFile('./Item Bank - Sheet1.csv'), item=>item.Chapter);
	console.log(spreadsheetData);
	const chapters=Object.values(_.groupBy(spreadsheetData, item=>item.Chapter)).map(items=>{
		return {
			name: items[0].Chapter,
			items: _.sortBy(items.map(item=>{
				return {
					...item,
					options: leters.filter(l=>item['Option '+l]?.trim()).map(l=>{
						return {
							text: item['Option '+l],
							isCorrect: item['Correct Answer']===l,
							letter: l,
						}
					})
				}
			}), item=>item.Prompt),
		}
	});
	//console.log(JSON.stringify(chapters, null, 4));
	//return;
	
	
	const PDFUtils=new PDFUtilsObj(colors, fonts, textIdents);	
	const contentWidth=540;	
	
	PDFUtils.textWidth=contentWidth-10;
	PDFUtils.defaultFontSize=11;
	PDFUtils.tocStyles={
		
	}
	
	PDFUtils.headerTitles=[

	];	
	
	
	PDFUtils.writeHeader=(doc, header, pageNum)=>{
		//return;	
		doc
			.image('images/gn_logo.png', 35, 15, {
				width: 75,
				align: 'center',
				valign: 'center'
				});
		doc
			.font(fonts.bold)
			.fontSize(16)
			.fillColor(colors.green)
			.text(header.titleLeft, textIdents.left+75, 20, {
				width: contentWidth-75,
				align: 'left',
			});
		
			
	}
	
	PDFUtils.writeFooter=(doc, pageNum, startPagingPage, footerData)=>{
		const lineY=753;
		const lineWidth=2;
		const hideLine=footerData && footerData.hideLine;
		const leftText=footerData?.leftText;
		
		doc
			.font(fonts.arial)
			.fontSize(10)
			.fill('black')
			.text(leftText, textIdents.left-14, lineY+5, {
				width: contentWidth,
				continued: false,
				align: 'left'
			});
	}		

	PDFUtils.convertHtml=(text)=>{		
		return decodeHtml(text).replace(/\\n/g, '').replace(/\{\{([^\s]+)\}\}/g, (match, id)=>{
			//console.log(match, id);
			const item=lessons.find(l=>l.old_lesson_id===id);
			if (item){
				return translate('Lesson')+' '+item.number+' '+translate(item.name);
			}
			return '';
		});
	}
	let blocks=[];
	await asyncForEach(chapters.filter(ch=>ch.name), async chapter=>{
		const arr=chapter.name.split('.');	
		/*
		const gradeNum=argv.gradeNum;
		const unitNum=argv.unitNum;
		const chapterNum=argv.chapterNum;
		*/
		if (gradeNum && arr[0]!=gradeNum){
			return;
		}
		if (unitNum && arr[1]!=unitNum){
			return;
		}
		if (chapterNum && arr[2]!=chapterNum){
			return;
		}

		
		

		//console.log('allWorkShets', allWorkShets.map(f=>f.path));
		//return;
		
		const generateBlocks=async ()=>{
			if (chapterNum){
				blocks=[];
			}	
			
			
				
				const items=chapter.items.filter(item=>item.Explanation);
				const docTitle=`Grade ${arr[0]} Unit ${arr[1]} Chapter ${arr[2]}`;

				blocks.push({
					type: 'h1',
					headerTitle: {titleLeft: docTitle},
					//startOnRightSide: true,
					value: 'Teacher Version',
					//color: colors.unitTitle,
					startOnNewPage: true,
				});			
				
				blocks.push({
					type: 'setFooter',
					leftText: docTitle
				});		
						
				
				await asyncForEach(chapter.items.filter(item=>item.Explanation), async item=>{
					blocks.push({
						type: 'h3',		
						font: fonts.italic,			
						//startOnRightSide: true,
						value: `${item.TEKS?.indexOf('General')===0 ? item.TEKS : (item.TEKS ? 'TEKS '+item.TEKS:'')} - DOK ${item['DOK Level']}`,
						//color: colors.unitTitle,
						moveToNextPageIfNotFit: true,
						startOnNewPage: true,
					});
					blocks.push({
						type: 'setFooter',
						leftText: `Grade ${arr[0]} Unit ${arr[1]} Chapter ${arr[2]}`
					});	
					//let html=`<p><em>${item.TEKS?.indexOf('General')===0 ? item.TEKS : (item.TEKS ? 'TEKS '+item.TEKS:'')} - DOK ${item['DOK Level']}</em></p>`;			
					let html=``;
					const number=items.indexOf(item)+1;
					html+=`<p><br/>${number}. ${item.Prompt}</p>`;
					if (item['URL of diagram']){
						html+=`<p><img src=${item['URL of diagram']}></p>`;
					}
					html+=`<ul>`;
					item.options.forEach(option=>{
						html+=option.isCorrect ? `<li><strong>${option.letter.toLowerCase()}.     ${option.text}</strong></li>` : `<li>${option.letter.toLowerCase()}.     ${option.text}</li><br />`;
					})
					html+=`<br/></ul>`;
					html+=`<p><em>Explanation:</em> ${item.Explanation}<br/><br/></p>`;
					//console.log(html);
					await asyncForEach(parse(html).childNodes, async (el)=>{
						await parseHTMLIntoBlocks(el, {
							ident: 0,
							brFontSize: 0.5,
							listBulletType: 'none',
							moveToNextPageIfNotFit: true,
							imgParams: {
								width: 300
							}
						}, blocks);
					});
					blocks.push({
						type: 'p',
						value:' ',
					});
				});	
				blocks.push({
					type: 'p',
					value:' ',
				});



				blocks.push({
					type: 'h1',
					headerTitle: {titleLeft: docTitle},
					//startOnRightSide: true,
					value: 'Student Version',
					//color: colors.unitTitle,
					startOnNewPage: true,
				});			
				
				blocks.push({
					type: 'setFooter',
					leftText: docTitle
				});		
						
				
				await asyncForEach(chapter.items.filter(item=>item.Explanation), async item=>{
					blocks.push({
						type: 'h3',		
						font: fonts.italic,			
						//startOnRightSide: true,
						value: ``,
						//color: colors.unitTitle,
						moveToNextPageIfNotFit: true,
						startOnNewPage: true,
					});
					blocks.push({
						type: 'setFooter',
						leftText: `Grade ${arr[0]} Unit ${arr[1]} Chapter ${arr[2]}`
					});	
					//let html=`<p><em>${item.TEKS?.indexOf('General')===0 ? item.TEKS : (item.TEKS ? 'TEKS '+item.TEKS:'')} - DOK ${item['DOK Level']}</em></p>`;			
					let html=``;
					const number=items.indexOf(item)+1;
					html+=`<p><br/>${number}. ${item.Prompt}</p>`;
					if (item['URL of diagram']){
						html+=`<p><img src=${item['URL of diagram']}></p>`;
					}
					html+=`<ul>`;
					item.options.forEach(option=>{
						html+=`<li>${option.letter.toLowerCase()}.     ${option.text}</li><br />`;
					})
					html+=`<br/></ul>`;				
					//console.log(html);
					await asyncForEach(parse(html).childNodes, async (el)=>{
						await parseHTMLIntoBlocks(el, {
							ident: 0,
							brFontSize: 0.5,
							listBulletType: 'none',
							moveToNextPageIfNotFit: true,
							imgParams: {
								width: 300
							}
						}, blocks);
					});
					blocks.push({
						type: 'p',
						value:' ',
					});
				});	
				
		}
		
		console.log('Preparing content blocks...');
		await generateBlocks();
		console.log('Created '+blocks.length+' blocks');
		
		//console.log('Generating temp PDF file...');
		//PDFUtils.generatePdf('temp.pdf', blocks);
		//fs.unlinkSync('./temp.pdf');
		if (chapterNum){
			const pdfFileName='item-bank/item-bank_'+chapter.name+'.pdf';
			console.log('Generating publication PDF '+pdfFileName+'...');
			PDFUtils.generatePdf(pdfFileName, blocks, true, false);
		}		

		
	})	
	let missingChapterData=false;
	if (!blocks.length){		
		missingChapterData=true;
		const docTitle=`Grade ${gradeNum} Unit ${unitNum} ${chapterNum ? 'Chapter '+chapterNum: ''}`;

		blocks.push({
			type: 'h1',
			headerTitle: {titleLeft: docTitle},
			//startOnRightSide: true,
			value: '',
			//color: colors.unitTitle,
			startOnNewPage: true,
		});			
		
		blocks.push({
			type: 'setFooter',
			leftText: docTitle
		});
		
	}
	if (!chapterNum && gradeNum && unitNum){
		const pdfFileName='item-bank/item-bank_'+gradeNum+'.'+unitNum+'.pdf';
		console.log('Generating publication PDF '+pdfFileName+'...');
		PDFUtils.generatePdf(pdfFileName, blocks, true, false);
	}
	if (chapterNum && gradeNum && unitNum && missingChapterData){
		const pdfFileName='item-bank/item-bank_'+gradeNum+'.'+unitNum+'.'+chapterNum+'.pdf';
		console.log('Generating publication PDF '+pdfFileName+'...');		

		PDFUtils.generatePdf(pdfFileName, blocks, true, false);
	}		
	
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})