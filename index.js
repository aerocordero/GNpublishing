//http://localhost:9000/workbook?model=<modelId>&unit=<unitId>[&firstExport=true][&flushCache=true]
//http://localhost:9000/teacherbook?model=<modelId>&unit=<unitId>[&firstExport=true][&flushCache=true]

const express = require('express');
const shell = require('shelljs');
const _ = require('lodash');
const {
		dbQuery,
		closeDbConnection,
		asyncForEach,
	} = require('./lib/utils');

const app = express();


var port = process.env.PORT || 9000;

app.use('/workbook', async(req, res, next)=>{
	const params=req.query;
	console.log(params);
	if (params.model_unit){
		const arr=params.model_unit.split('_');
		params.model=arr[0];
		params.unit=arr[1];
	}
	shell.exec('git pull origin master');
	const model=(await dbQuery([
		'SELECT * FROM `model` t',
		'WHERE t.`model_id` = ?'
	], [params.model]))[0];
	
	const unit=(await dbQuery([
		'SELECT * FROM `unit` t',
		'WHERE t.`unit_id` = ?'
	], [params.unit]))[0];
	unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
	
	const destFilePath='result/Workbook '+model.display_name+' Unit '+unit.number+'.pdf';
	const cmd='node workbook.js --model='+params.model+' --unit='+params.unit
		+(params.firstExport ? ' --first-export' : '')
		+(params.flushCache ? ' --flush-cache' : '')
		+' --dest-path="'+destFilePath+'"'
	shell.exec(cmd);
	res.download(destFilePath);
});

app.use('/', async(req, res, next)=>{
	const params=req.query;
	console.log(params);
	const modelIds=[11, 9, 19];
	let models=(await dbQuery([
		'SELECT * FROM `model` t',
		'WHERE t.`model_id` IN ('+modelIds.join(',')+')'
	], []));
	//console.log(models);
	models=_.sortBy(models, m=>m.display_name);
	
	await asyncForEach(models, async(model)=>{
		model.units=(await dbQuery([
			'SELECT * FROM `unit` t',
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
			modelUnits.push({val:model.model_id+'_'+unit.unit_id, label:model.display_name+' Unit '+unit.number})
		})
	});
	let html=`
		<h1>Workbook</h1>
		<form method="GET" action="/workbook">
			<label>Select Unit:</label>
			<select name="model_unit">
				`+modelUnits.map(item=>'<option value="'+item.val+'">'+item.label+'</option>')+`
			<select><br/><br/>
			<label>
				<input type="checkbox" name="flushCache" value="true"/> Clear Cache (DB and files)
			</label><br/><br/>
			<label>
				<input type="checkbox" name="firstExport" value="true"/> 1st export
			</label><br/><br/>
			<button type="submit">Generate PDF</button>
		</form>
	`;
	/*
	models.forEach(model=>{
		html+='<h2>'+model.display_name+'</h2>'
		model.units.forEach(unit=>{
			html+='<a href="/workbook?model='+model.model_id+'&unit='+unit.unit_id+'">'+model.display_name+' Unit '+unit.number+'</a><br/>';
		})
	});
	*/
	res.send(html);
	res.end();
});

const server=app.listen(port, null, function() {
    console.log('Express server listening on port %d', port);
});
server.timeout = 0;
