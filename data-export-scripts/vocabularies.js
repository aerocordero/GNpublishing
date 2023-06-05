async function main() {
	const mysql = require('mysql2');
	const bluebird = require('bluebird');
	const parse = require('node-html-parser').parse;
	const fs = require('fs');
	const http = require('https');
	const _ = require('lodash');
	const Jimp = require('jimp');
	const argv = require('yargs').argv;

    const Json2csvParser = require('json2csv').Parser;

	
	const config = require('../config.json');
	
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
		loadQueue
	} = require('../lib/utils');
	
	
	const models=_.sortBy((await dbQuery([
		'SELECT model_id, display_name, unit_id, name FROM `model` t',
		'WHERE t.`model_id` IN (11,9,19)'
	], [])), m=>m.name);
	
	let allUnits=(await dbQuery([
		'SELECT t.unit_id, t.name, t.lessons, m.model_id FROM `unit` t',
        'LEFT JOIN model_unit_mapping m ON t.`unit_id` = m.unit_id',
		'WHERE m.model_id IN (11,9,19)'
	], []));

    let allLessons=await dbQuery([
		'SELECT t.lesson_id, t.old_lesson_id, t.name, m.unit_id FROM `lesson` t',
		'INNER JOIN `unit_lesson_mapping` m',
		'ON t.`lesson_id`=m.`lesson_id` AND m.`unit_id` IN ('+allUnits.map(u=>u.unit_id).join(',')+')',
	], []);

    let vocabularies=await dbQuery([
        'SELECT t.*, m.lesson_id',
        'FROM vocab t',
        'JOIN lesson_vocab_mapping m ON m.vocab_id = t.vocab_id',
        'LIMIT 10000000000'
    ], []);		

    let spVocabularies=await dbQuery([
        'SELECT sp.*, m.lesson_id',
        'FROM lesson_vocab_mapping m',
        'JOIN vocab t ON m.vocab_id = t.vocab_id',
        'LEFT OUTER JOIN vocab sp ON sp.version_vocab_id = t.vocab_id and sp.language_id=2',
        'LIMIT 10000000000'
    ], []);	

    const data=[];

    models.forEach(model=>{
        let units=allUnits.filter(u=>u.model_id==model.model_id);
        units.forEach(unit=>{
            unit.number=model.unit_id.split(',').indexOf(unit.unit_id+'')+1;
        });
        units=_.sortBy(units, u=>u.number);
        //console.log(units);
        units.forEach(unit=>{
            let lessons=allLessons.filter(l=>l.unit_id==unit.unit_id);
            lessons.forEach(lesson=>{
                lesson.number=unit.lessons.split(',').indexOf(lesson.old_lesson_id+'')+1;
            });
            lessons=_.sortBy(lessons, u=>u.number);
            
            lessons.forEach(lesson=>{

                
                
                const vocabs=vocabularies.filter(v=>v.lesson_id===lesson.lesson_id);
                spVocabs=spVocabularies.filter(v=>v.lesson_id===lesson.lesson_id);
                vocabs.forEach(vocab=>{
                    const obj={
                        model: model.name,
                        unit: unit.number,
                        lesson: lesson.number,
                    };
                    if (vocab.language_id==1){
                        obj.vocab_en=vocab.word;
                        obj.vocab_en_descr=vocab.definition;
                    }
                    const spWord=spVocabs.find(v=>v.version_vocab_id==vocab.vocab_id && v.language_id===2);
                    if (vocab.language_id==2){
                        obj.vocab_es=vocab.word;
                        obj.vocab_es_descr=vocab.definition;
                    }
                    if (spWord){
                        obj.vocab_es=spWord.word;
                        obj.vocab_es_descr=spWord.definition;
                        console.log(obj);
                    }
                    //console.log(vocab);
                    data.push(obj);
                });
                /*
                spVocabs.forEach(vocab=>{
                    if (vocab.language_id==1){
                        obj.vocab_en=vocab.word;
                        obj.vocab_en_descr=vocab.definition;
                    }
                    if (vocab.language_id==2){
                        obj.vocab_es=vocab.word;
                        obj.vocab_es_descr=vocab.definition;
                    }
                });*/
                
            })
        });

    })

    const json2csvParser = new Json2csvParser({
        fields: [
            {
                label: 'Model',
                value: 'model', 
                default: ''
            },
            {
                label: 'Unit',
                value: 'unit', 
                default: ''
            },
            {
                label: 'Lesson',
                value: 'lesson', 
                default: ''
            },
            {
                label: 'Word (EN)',
                value: 'vocab_en', 
                default: ''
            },
            {
                label: 'Description (EN)',
                value: 'vocab_en_descr', 
                default: ''
            },
            {
                label: 'Word (ES)',
                value: 'vocab_es', 
                default: ''
            },
            {
                label: 'Description (ES)',
                value: 'vocab_es_descr', 
                default: ''
            },
        ],
        header: true
    });
    
    const csv = json2csvParser.parse(data).toString('utf-8').replace(/’/g, '`');

    fs.writeFileSync('./vocabs.csv', csv, 'utf-8');
    //console.log(data);

}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})