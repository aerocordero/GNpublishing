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

	const shell = require('shelljs');

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

	setDBName('greenninja_texas');
	
	const modelIds=[11,9,19];
	const grades=[6,7,8];
	await asyncForEach(grades, async gradeNum=>{
		const modelId=modelIds[grades.indexOf(gradeNum)];
		const units=(await dbQuery([
			'SELECT * FROM `model_unit_mapping` t',
			'WHERE t.`model_id` = ?',
			'ORDER BY t.position'
		], [modelId]));
		await asyncForEach(units, async unit=>{
			shell.exec(`node item-bank-output.js --grade-num=${gradeNum}  --unit-num=${unit.position+1}  --chapter-num=${''} `);
			console.log(`node item-bank-output.js --grade-num=${gradeNum}  --unit-num=${unit.position+1}  --chapter-num=${''} `);
		})
	})	
	
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})