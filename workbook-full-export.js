const shell = require('shelljs');
const _ = require('lodash');
const config = require('./config.json');
const fs = require('fs');
const moment=require('moment');
const filesize=require('filesize');
const languageId=2;
const language='spanish';
const {
	dbQuery,
	closeDbConnection,
	asyncForEach,
} = require('./lib/utils');
	
async function main() {
	const modelIds=[11/*, 9, 19*/];
	let models=(await dbQuery([
		'SELECT model_id, display_name, unit_id FROM `model` t',
		'WHERE t.`model_id` IN ('+modelIds.join(',')+')'
	], []));
	//console.log(models);
	models=_.sortBy(models, m=>m.display_name);

	await asyncForEach(models, async(model)=>{
		model.units=(await dbQuery([
			'SELECT unit_id FROM `unit` t',
			'WHERE t.`unit_id` IN ('+model.unit_id+')'
		], []));
		model.units.forEach(unit=>{
			unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
		});
		model.units=_.sortBy(model.units, u=>u.number);
	});
	const modelUnits=[];
	models.forEach(model=>{
		model.units.forEach(unit=>{
			modelUnits.push({model:model.model_id, unit:unit.unit_id, label:model.display_name+' Unit '+unit.number})
		})
	});

	await asyncForEach(modelUnits, async(item)=>{
		//Workbook '+model.display_name+' Unit '+unit.number+(languageId >1 ? '('+language+')' : '')+'.pdf
		const destFilePath='result/Workbook '+item.label+(languageId >1 ? '('+language+')' : '')+'.pdf';
		if (fs.existsSync(destFilePath)){
			return;
		}
		console.log('Exporting '+item.label);
		const cmd='node workbook.js --model='+item.model+' --unit='+item.unit
			+' --no-gd-sync '
			//+(params.firstExport ? ' --first-export' : '')
			//+(params.flushCache ? ' --flush-cache' : '')
			//+(config.alwaysFlushDBCache ? ' --flush-db-cache' : '')
			+(language ? ' --language="spanish"' : '')
			+' --dest-path="'+destFilePath+'"'
		inProgress=true;
		shell.exec(cmd);
		inProgress=false;
	});
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})