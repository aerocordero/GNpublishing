//http://localhost:9000/workbook?model=<modelId>&unit=<unitId>[&firstExport=true][&flushCache=true]
//http://localhost:9000/teacherbook?model=<modelId>&unit=<unitId>[&firstExport=true][&flushCache=true]

const express = require('express');
const shell = require('shelljs');
const _ = require('lodash');
const config = require('./config.json');
const fs = require('fs');
const moment=require('moment');
const filesize=require('filesize');
const {
		dbQuery,
		closeDbConnection,
		asyncForEach,
	} = require('./lib/utils');

const app = express();
const expressWs = require('express-ws')(app);
const router = require('./api');

const statePath=__dirname+'/state.json';
//const db=pool.promise();
const state=fs.existsSync(statePath) ? require(statePath) : {};


var port = process.env.PORT || 9000;
let inProgress=false;

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "PUT, DELETE, POST, GET");
  
  next();
});

app.use('/result', express.static('./result'));

app.use('/api', router);

app.use('/workbook', async(req, res, next)=>{
	if (inProgress){
		res.send('Error! PDF processing is already in progress');
		res.end();
		return;
	}
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
		+(params.language ? ' --language="'+params.language+'"' : '')
		+(config.alwaysFlushDBCache ? ' --flush-db-cache' : '')
		+' --dest-path="'+destFilePath+'"'
	inProgress=true;
	shell.exec(cmd);
	inProgress=false;
	res.download(destFilePath);
});

app.use('/', express.static('./public'));

const server=app.listen(port, null, function() {
    console.log('Express server listening on port %d', port);
});
server.timeout = 0;
