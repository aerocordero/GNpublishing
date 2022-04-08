const materialsQtySet=(results)=>{

	//var json_response = {"status":200,"result":results};
	//res.send(json_response);
	// console.log(results[0].unit_id.split(","));
	let unitOverviewUpcycleOptionalMaterials = new Map();
	let unitOverviewTeacherMaterials = new Map();
	let unitOverviewKitMaterials = new Map();
	let unitOverviewLessonMaterialMapping = new Map();  //list of all materials along with lesson id and sequence info for showing links next to material


	let materialLsTeacher = []; //list of all materials in a lesson, used this to show in activity section
	let materialLsKit = []; //list of all materials in a lesson, used this to show in activity section
	let materialLsOptional = []; //list of all materials in a lesson, used this to show in activity section

	if (results.length > 0) {

		results.map((materialDet, index) => {

			if (unitOverviewLessonMaterialMapping.has(materialDet.material_id)) {
				if (materialDet.material_id === 1 && materialDet.forWhomInd === 0) {

				} else {
					let tempmap = unitOverviewLessonMaterialMapping.get(materialDet.material_id);
					tempmap.set(materialDet.lesson_id, {
						"material_id": materialDet.material_id,
						"lesson_id": materialDet.lesson_id,
						"lesson_name": materialDet.lesson_name,
						"lesson_sequence": materialDet.sequence,
						"optionalInd":  materialDet.optionalInd
					});
					unitOverviewLessonMaterialMapping.set(materialDet.material_id, tempmap);
				}
			} else {
				if (materialDet.material_id === 1 && materialDet.forWhomInd === 0 && 0) { //WTF? This removes "Computer (additional classroom/teacher electronic device)" item

				} else {
					unitOverviewLessonMaterialMapping.set(materialDet.material_id, new Map().set(materialDet.lesson_id, {
						"material_id": materialDet.material_id,
						"lesson_id": materialDet.lesson_id,
						"lesson_name": materialDet.lesson_name,
						"lesson_sequence": materialDet.sequence,
						"optionalInd":  materialDet.optionalInd
					}));
				}
			}

			let currentMaterialsStudentBringsInd = materialDet.student_can_bring;
			let currentMaterialsProviderInd = materialDet.provider;
			let currentMaterialsOptionalInd = materialDet.optionalInd; //0 = no, 1 = yes
			let currentStudent_can_bring= materialDet.student_can_bring;
			let currentRunsOutInd= materialDet.runsOutInd;
			let currentMaterialsReusableInd = materialDet.reusableInd;
			let currentMaterialsForWhomInd = materialDet.forWhomInd;
			let currentNotes = materialDet.notes;
			let currentAlternative = materialDet.alternative;

			if (currentMaterialsForWhomInd === 2) {
				currentQty = (Math.ceil(32/materialDet.group_size))*materialDet.quantity;
			}
			else if (currentMaterialsForWhomInd === 1) {
				currentQty = 32*materialDet.quantity;
			}
			else{
				currentQty = materialDet.quantity;
			}

			let tag = "";

			// identfy if the material goes in upcycle optional bucket? or teachers or kits
			if (currentMaterialsOptionalInd === 1  ) {
				tag = "Upcycle Optional Materials";
			// || unitOverviewUpcycleOptionalMaterials.get(materialDet.material_id) !== undefined
				// if(unitOverviewKitMaterials ||)

				//new item in list? add to map...
				if (unitOverviewUpcycleOptionalMaterials.get(materialDet.material_id) === undefined) {
					materialDet.totalQty = parseFloat(currentQty);
					if (materialDet.reusableInd === 0) materialDet.balance = 0;
					else materialDet.balance = currentQty;

					// making notes and alternative an array with lesson ids fro correspondence
					//for notes
					let tempArr = [];
					if (currentNotes == null || currentNotes === '')
						tempArr = [];
					else
						tempArr = [{
							note: currentNotes,
							lesson_id: materialDet.lesson_id,
							lesson_sequence: materialDet.sequence,
							lesson_name: materialDet.lesson_name
						}];
					materialDet.notes = tempArr;

					//for alternative
					if (currentAlternative == null || currentAlternative === '')
						tempArr = [];
					else
						tempArr = [{
							alternative: currentAlternative,
							lesson_id: materialDet.lesson_id,
							lesson_sequence: materialDet.sequence,
							lesson_name: materialDet.lesson_name
						}];
					materialDet.alternative = tempArr;

					unitOverviewUpcycleOptionalMaterials.set(materialDet.material_id, materialDet);
				}
				else {
					//item repeated ------
					let material = unitOverviewUpcycleOptionalMaterials.get(materialDet.material_id);
					let qtyWehaveForReuse = material.balance;
					let totalQty = parseFloat(material.totalQty);

					// item runs out? take max qty if yes.
					if (materialDet.runsOutInd === 1) {
						totalQty = Math.max(currentQty, totalQty)
					}
					else {

						//reusable
						if (currentMaterialsReusableInd === 1) {

							if (qtyWehaveForReuse === 0) {
								qtyWehaveForReuse = currentQty;
								totalQty += parseFloat(currentQty);
							} else if (qtyWehaveForReuse > 0) {

								if (qtyWehaveForReuse <= currentQty) {
									totalQty += currentQty - qtyWehaveForReuse;
									qtyWehaveForReuse = currentQty;
								} else {
								}
							}

						} else {
							//consumable

							//we have reusable items stacked so we can use them
							if (qtyWehaveForReuse > 0) {

								if (currentQty >= qtyWehaveForReuse) {
									totalQty += currentQty - qtyWehaveForReuse;
									qtyWehaveForReuse = 0;
								} else {
									qtyWehaveForReuse = qtyWehaveForReuse - currentQty;
								}

							} else {
								//no reusable left, so we need to buy more

								totalQty += parseFloat(currentQty);
								qtyWehaveForReuse = 0;
							}

						}
					}

					if (currentMaterialsOptionalInd != null && currentMaterialsOptionalInd === 1) {
						material.optionalInd = 1;
					}
					if (currentStudent_can_bring != null && currentStudent_can_bring === 1) {
						material.student_can_bring = 1;
					}
					if (currentRunsOutInd != null && currentRunsOutInd === 1) {
						material.runsOutInd = 1;
					}

					// if (Array.isArray(material.notes)) {
					//     material.notes.push({note: currentNotes, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.lesson_name, lesson_name: materialDet.sequence});
					// } else {
					//     // let notesRegExp = new RegExp(currentNotes);
					//     // if (currentNotes != null && currentNotes !== '' && !(notesRegExp.test(material.notes))) {
					//         if(material.notes == null || material.notes === '' )
					//             material.notes = [{note: currentNotes, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.lesson_name, lesson_name: materialDet.sequence}];
					//         else
					//             let tempArr = [{note: material.notes, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.lesson_name, lesson_name: materialDet.sequence}];
					//             material.notes = tempArr;
					//             material.notes.push({note: currentNotes, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.lesson_name, lesson_name: materialDet.sequence});
					//     // }
					// }
					// let alternativeRegExp = new RegExp(material.alternative);
					// if (currentAlternative != null && currentAlternative !== '' && !(alternativeRegExp.test(currentAlternative))) {
					//     if(material.alternative == null)
					//         material.alternative = currentAlternative;
					//     else
					//         material.alternative += "; " + currentAlternative;
					// }

					//Add all notes from different lessons in the array
					if(currentNotes != null && currentNotes !== ''){
						material.notes.push({note: currentNotes, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.sequence, lesson_name: materialDet.lesson_name});
					}

					//Add all alternatives from different lessons in the array
					if(currentAlternative != null && currentAlternative !== ''){
						material.alternative.push({alternative: currentAlternative, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.sequence, lesson_name: materialDet.lesson_name});
					}

					//done with changes for quantity
					material.balance = qtyWehaveForReuse;
					material.totalQty = parseFloat(totalQty);
					unitOverviewUpcycleOptionalMaterials.set(material.material_id, material);

				}

			}
			else if(currentMaterialsProviderInd === "School" || currentMaterialsProviderInd === "Class" || currentMaterialsProviderInd === "Store" || currentMaterialsProviderInd === "Specialty"){
				tag = "Teacher";

				//new item in list? add to map...
				if (unitOverviewTeacherMaterials.get(materialDet.material_id) === undefined) {
					materialDet.totalQty = parseFloat(currentQty);
					if (materialDet.reusableInd === 0) materialDet.balance = 0;
					else materialDet.balance = currentQty;

					// making notes and alternative an array with lesson ids fro correspondence
					//for notes
					let tempArr = [];
					if (currentNotes == null || currentNotes === '')
						tempArr = [];
					else
						tempArr = [{
							note: currentNotes,
							lesson_id: materialDet.lesson_id,
							lesson_sequence: materialDet.sequence,
							lesson_name: materialDet.lesson_name
						}];
					materialDet.notes = tempArr;

					//for alternative
					if (currentAlternative == null || currentAlternative === '')
						tempArr = [];
					else
						tempArr = [{
							alternative: currentAlternative,
							lesson_id: materialDet.lesson_id,
							lesson_sequence: materialDet.sequence,
							lesson_name: materialDet.lesson_name
						}];
					materialDet.alternative = tempArr;

					unitOverviewTeacherMaterials.set(materialDet.material_id, materialDet);
				}
				else {
					//item repeated ------
					let material = unitOverviewTeacherMaterials.get(materialDet.material_id);
					let storedReusableInd = material.reusableInd;
					let qtyWehaveForReuse = material.balance;
					let totalQty = parseFloat(material.totalQty);

					// item runs out? take max qty if yes.
					if (materialDet.runsOutInd === 1) {
						totalQty = Math.max(currentQty, totalQty)
					}
					else {

						//reusable
						if (currentMaterialsReusableInd === 1) {

							if (qtyWehaveForReuse === 0) {
								qtyWehaveForReuse = currentQty;
								totalQty += parseFloat(currentQty);
							} else if (qtyWehaveForReuse > 0) {

								if (qtyWehaveForReuse <= currentQty) {
									totalQty += currentQty - qtyWehaveForReuse;
									qtyWehaveForReuse = currentQty;
								} else {
								}
							}

						} else {
							//consumable

							//we have reusable items stacked so we can use them
							if (qtyWehaveForReuse > 0) {

								if (currentQty >= qtyWehaveForReuse) {
									totalQty += currentQty - qtyWehaveForReuse;
									qtyWehaveForReuse = 0;
								} else {
									qtyWehaveForReuse = qtyWehaveForReuse - currentQty;
								}

							} else {
								//no reusable left, so we need to buy more

								totalQty += parseFloat(currentQty);
								qtyWehaveForReuse = 0;
							}

						}
					}

					if (currentMaterialsOptionalInd != null && currentMaterialsOptionalInd === 1) {
						material.optionalInd = 1;
					}
					if (currentStudent_can_bring != null && currentStudent_can_bring === 1) {
						material.student_can_bring = 1;
					}
					if (currentRunsOutInd != null && currentRunsOutInd === 1) {
						material.runsOutInd = 1;
					}

					//Add all notes from different lessons in the array
					if(currentNotes != null && currentNotes !== ''){
						material.notes.push({note: currentNotes, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.sequence, lesson_name: materialDet.lesson_name});
					}

					//Add all alternatives from different lessons in the array
					if(currentAlternative != null && currentAlternative !== ''){
						material.alternative.push({alternative: currentAlternative, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.sequence, lesson_name: materialDet.lesson_name});
					}

					//done with changes for quantity
					material.balance = qtyWehaveForReuse;
					material.totalQty = totalQty;
					unitOverviewTeacherMaterials.set(material.material_id, material);

				}
			}
			else if(currentMaterialsProviderInd === "Kit"){
				tag = "Kit";

				//new item in list? add to map...
				if (unitOverviewKitMaterials.get(materialDet.material_id) === undefined) {
					materialDet.totalQty = parseFloat(currentQty);
					if (materialDet.reusableInd === 0) materialDet.balance = 0;
					else materialDet.balance = currentQty;

					// making notes and alternative an array with lesson ids fro correspondence
					//for notes
					let tempArr = [];
					if (currentNotes == null || currentNotes === '')
						tempArr = [];
					else
						tempArr = [{
							note: currentNotes,
							lesson_id: materialDet.lesson_id,
							lesson_sequence: materialDet.sequence,
							lesson_name: materialDet.lesson_name
						}];
					materialDet.notes = tempArr;

					//for alternative
					if (currentAlternative == null || currentAlternative === '')
						tempArr = [];
					else
						tempArr = [{
							alternative: currentAlternative,
							lesson_id: materialDet.lesson_id,
							lesson_sequence: materialDet.sequence,
							lesson_name: materialDet.lesson_name
						}];
					materialDet.alternative = tempArr;

					unitOverviewKitMaterials.set(materialDet.material_id, materialDet);
				}
				else {
					//item repeated ------
					let material = unitOverviewKitMaterials.get(materialDet.material_id);
					let storedReusableInd = material.reusableInd;
					let qtyWehaveForReuse = material.balance;
					let totalQty = material.totalQty;

					// item runs out? take max qty if yes.
					if (materialDet.runsOutInd === 1) {
						totalQty = Math.max(currentQty, totalQty)
					}
					else {

						//reusable
						if (currentMaterialsReusableInd === 1) {

							if (qtyWehaveForReuse === 0) {
								qtyWehaveForReuse = currentQty;
								totalQty += parseFloat(currentQty);
							} else if (qtyWehaveForReuse > 0) {

								if (qtyWehaveForReuse <= currentQty) {
									totalQty += currentQty - qtyWehaveForReuse;
									qtyWehaveForReuse = currentQty;
								} else {
								}
							}

						} else {
							//consumable

							//we have reusable items stacked so we can use them
							if (qtyWehaveForReuse > 0) {

								if (currentQty >= qtyWehaveForReuse) {
									totalQty += currentQty - qtyWehaveForReuse;
									qtyWehaveForReuse = 0;
								} else {
									qtyWehaveForReuse = qtyWehaveForReuse - currentQty;
								}

							} else {
								//no reusable left, so we need to buy more

								totalQty += parseFloat(currentQty);
								qtyWehaveForReuse = 0;
							}

						}
					}

					if (currentMaterialsOptionalInd != null && currentMaterialsOptionalInd === 1) {
						material.optionalInd = 1;
					}
					if (currentStudent_can_bring != null && currentStudent_can_bring === 1) {
						material.student_can_bring = 1;
					}
					if (currentRunsOutInd != null && currentRunsOutInd === 1) {
						material.runsOutInd = 1;
					}

					//Add all notes from different lessons in the array
					if(currentNotes != null && currentNotes !== ''){
						material.notes.push({note: currentNotes, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.sequence, lesson_name: materialDet.lesson_name});
					}

					//Add all alternatives from different lessons in the array
					if(currentAlternative != null && currentAlternative !== ''){
						material.alternative.push({alternative: currentAlternative, lesson_id: materialDet.lesson_id, lesson_sequence: materialDet.sequence, lesson_name: materialDet.lesson_name});
					}

					//done with changes for quantity
					material.balance = qtyWehaveForReuse;
					material.totalQty = totalQty;
					unitOverviewKitMaterials.set(material.material_id, material);

				}
			}

		});

		let reducedLessonMaterialMapping = Object.create(null);
		unitOverviewLessonMaterialMapping.forEach((value, key) => {
			reducedLessonMaterialMapping[key] = reducedLessonMaterialMapping[key] || [];
			[...value.values()].map(value1 => reducedLessonMaterialMapping[key].push(value1));
		});

		if(reducedLessonMaterialMapping[1]=== undefined || (reducedLessonMaterialMapping[1]!== undefined && reducedLessonMaterialMapping[1].length === 0)){
			unitOverviewTeacherMaterials.delete(1);
		}

		unitOverviewKitMaterials.forEach((value, key) => {
			materialLsKit.push(value);
		});
		unitOverviewTeacherMaterials.forEach((value, key) => {
			materialLsTeacher.push(value);
		});
		unitOverviewUpcycleOptionalMaterials.forEach((value, key) => {
			materialLsOptional.push(value);
		});

		return {
			"status": 200,
			"materialsListUnitOverview": results,
			"materialLsKit": materialLsKit,
			"materialLsTeacher": materialLsTeacher,
			"materialLsOptional": materialLsOptional,
			"materialLessonMapping": reducedLessonMaterialMapping,
		};
	}
	
}

module.exports = {
	materialsQtySet
};