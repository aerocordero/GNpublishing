//http://localhost:9000/workbook?model=<modelId>&unit=<unitId>[&firstExport=true][&flushCache=true]
//http://localhost:9000/teacherbook?model=<modelId>&unit=<unitId>[&firstExport=true][&flushCache=true]

const express = require('express');
const shell = require('shelljs');
const {
		dbQuery,
		closeDbConnection,
	} = require('./lib/utils');

const app = express();


var port = process.env.PORT || 9000;

app.use('/workbook', async(req, res, next)=>{
	const params=req.query;
	console.log(params);
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

const server=app.listen(port, null, function() {
    console.log('Express server listening on port %d', port);
});
server.timeout = 0;
