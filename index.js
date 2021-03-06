var mysql = require('mysql');

var MySQLStore = function(params, callbacks){
    var self = this;
    this.params = params;

    if(this.params.models){
        for(var key in this.params.models){
            this.params.models[key].store = this;
        }
    }

    this.connect = function(params, cbs){
        if(!this.connection){
            this.connection = mysql.createConnection(this.params);
        }

        this.connection.connect(function(err) {
            if (err) {
                if(cbs){
                    cbs(err, self);
                }
                return;
            }else{
                if(cbs){
                    cbs(false, self);
                }
            }
        });
    };

    this.disconnect = function(cbs){
        this.connection.end();
        if(cbs){
            cbs(false);
        }
    };

    this.save = function(records, cbs){
        saveRecords(this, records, [], cbs);
    };

    this.read = function(model, params, cbs){
        var query = objectToQuery(this, model, params);
        console.log(query);
        var self = this;
        var tester = this.connection.query(query.sql, query.values, function(err, res){
            if(err){
                console.log(err);
                if(cbs){
                    cbs(err, res);
                }
            }else{
                if(cbs){
                    cbs(false, res);
                }
            }
        });
    };

    this.destroy = function(records, cbs){
        removeRecords(this, records, [], cbs);
    };

    this.loadModelConfig = function(cbs){
        var self = this;

        var tableSQL = 'SHOW TABLES;';

        this.connection.query({sql: tableSQL, raw: true}, function(err, res){
            var modelNames = [];
            for(var i=0;i<res.length;i++){
                modelNames.push(res[i][Object.keys(res[i])[0]]);
            }

            loadAllTableData(self, modelNames, {}, function(err, data){
                if(!err){
                    console.log(data);

                    //turn the data into model configurations
                    var modelConfigs = {};

                    for(var tableName in data){
                        modelConfigs[tableName] = {
                            name: tableName,
                            collection: tableName,
                            fields: {}
                        };

                        var fields = data[tableName];
                        for(var l=0;l<fields.length;l++){
                            var field = fields[l];

                            modelConfigs[tableName].fields[field.Field] = {};
                            switch(field.Type){
                                case 'timestamp':
                                case 'datetime':
                                    modelConfigs[tableName].fields[field.Field].type='DATETIME';
                                    break;
                                default:
                                    if(field.Type.substr(0,3)=='int'){
                                        modelConfigs[tableName].fields[field.Field].type='NUMBER';
                                    }else{
                                        if(field.Type.substr(0, 7)=='tinyint'){
                                            modelConfigs[tableName].fields[field.Field].type='BOOLEAN';
                                        }else{
                                            console.log(field.Type);
                                            modelConfigs[tableName].fields[field.Field].type='STRING';
                                        }
                                    }
                                    
                                    break;
                            }
                            


                        }
                    }
                    if(cbs && cbs){
                        cbs(false, modelConfigs);
                    }
                }else{
                    if(cbs && cbs){
                        cbs(err);
                    }
                }
            });
        });
    };

    if(this.params.autoconnect){
        this.connect(this.params, function(err){
            if(!err){
                if(callbacks){
                    callbacks(false, self);
                }
            }else{
                if(callbacks){
                    callbacks(err, self);
                }
            }
        });
    }else{
        if(callbacks){
            callbacks(false, this);
        }
    }
};

    function loadAllTableData(self, tableNames, loadedTables, cbs){
        if(tableNames.length===0){
            if(cbs && cbs){
                cbs(false, loadedTables);
            }
            return;
        }
        var tableName = tableNames.shift();

        loadTableData(self, tableName, function(err, data){
            if(!err){
                loadedTables[tableName] = data;
                loadAllTableData(self, tableNames, loadedTables, cbs);
            }else{
                if(cbs && cbs){
                    cbs(err);
                }
            }
        });
    }

    function loadTableData(self, tableName, cbs){
        var tableQuery = 'DESCRIBE '+tableName;

        self.connection.query(tableQuery, function(err, res){
            if(!err){
                if(cbs && cbs){
                    cbs(false, res);
                }
            }else{
                if(cbs && cbs){
                    cbs(err);
                }
            }
        });
    }

    function padLeft(str, cha, len){
        str = str.toString();
        for(var i=0; i<len-str.length;i++){
            str = cha+str;
        }

        return str;
    }

    function escapeValue(field, value){
        var returnValue = '';

        switch(field.type){
            case 'TIMESTAMP':
                returnValue = '"'+value.getUTCFullYear()+'-'+padLeft(value.getUTCMonth(), '0', 2)+'-'+padLeft(value.getUTCDate(), '0', 2)+' '+padLeft(value.getUTCHours(),'0',2)+':'+padLeft(value.getUTCMinutes(), '0', 2)+':'+value.getUTCSeconds()+'"';
                break;
            case 'NUMBER':
                returnValue = value;
                break;
            case 'STRING':
                returnValue = '"'+value+'"';
                break;
            case 'BOOLEAN':
                returnValue = value?1:0;
                break;
        }

        return returnValue;
    }

    function saveRecords(self, records, processedRecords, cbs){
        var errors = [];
        if(records.length===processedRecords.length){
            if(errors.length>0){
                if(cbs){
                    cbs(errors, records, processedRecords);
                }
            }else{
                if(cbs){
                    cbs(false, records);
                }
            }

            return;
        }

        var recordItem = records[processedRecords.length];
        
        saveRecord(self, recordItem, {
            success: function(ri){
                processedRecords.push(ri);
                saveRecords(self, records, processedRecords, cbs);
            },
            error: function(err, ri){
                errors.push(err);
                ri.lastError = err;
                processedRecords.push(ri);
                saveRecords(self, records, processedRecords, cbs);
            }
        });
    }

    function saveRecord(self, recordItem, cbs){
        var saveSQL = '';

        var dataValues = recordItem.dataValues;
        var model = recordItem.model;
        var fields = model.config.fields;

        var setFields = [];
        var pkField = model.config.pk_field||'id';

        if(dataValues.id){ //update
            saveSQL = 'UPDATE '+model.config.collection+' SET ';
            for(var key in fields){
                if(key!=pkField){
                    if(recordItem.get(key)){
                        console.log(key);
                        console.log(recordItem.get(key));
                        saveSQL += key+'=?,';
                        setFields.push(recordItem.get(key));
                    }
                }
            }
            saveSQL=saveSQL.substr(0, saveSQL.length-1);//remove the last comma
            saveSQL+=' WHERE '+pkField+'=?;';
            setFields.push(recordItem.get(pkField));

        }else{ //insert
            recordItem.set('created_at', new Date());
            recordItem.set('modified_at', new Date());

            saveSQL = 'INSERT INTO '+model.config.collection+' (';
            valueSQL = '';
            for(var key in fields){
                console.log(recordItem.get(key));
                if(recordItem.get(key)){
                    saveSQL += key+',';
                    setFields.push(recordItem.get(key));
                    valueSQL+= '?,';
                }
            }

            saveSQL = saveSQL.substr(0, saveSQL.length-1)+') VALUES ('+valueSQL.substr(0, valueSQL.length-1)+')';
        }
        
        self.connection.query(saveSQL, setFields, function(err, res){
            if(err){
                console.log(err);
                if(cbs){
                    cbs(err, recordItem);
                }
            }else{
                recordItem.set(pkField, recordItem.get(pkField) || res.insertId);
                if(cbs){
                    cbs(false, recordItem);
                }
            }
        });
    }

    function removeRecords(self, records, processedRecords, cbs){
        console.log('REMOVING');
        console.log(records);
        var errors = [];
        if(records.length===processedRecords.length){
            if(errors.length>0){
                if(cbs){
                    cbs(errors, records, processedRecords);
                }
            }else{
                if(cbs){
                    cbs(false, records);
                }
            }

            return;
        }

        var recordItem = records[processedRecords.length];
        
        removeRecord(self, recordItem, {
            success: function(ri){
                processedRecords.push(ri);
                removeRecords(self, records, processedRecords, cbs);
            },
            error: function(err, ri){
                errors.push(err);
                ri.lastError = err;
                processedRecords.push(ri);
                removeRecords(self, records, processedRecords, cbs);
            }
        });
    }

    function removeRecord(self, recordItem, cbs){
        var model = recordItem.model;
        var fields = model.config.fields;

        var pkField = model.config.pk_field||'id';
        var removeSQL = 'UPDATE '+model.config.collection+' SET deleted_at=?, deleted_by=? WHERE '+pkField+' = ?;';

        var setFields = [new Date(), recordItem.get('deleted_by'), recordItem.get(pkField)];

        self.connection.query(removeSQL, setFields, function(err, res){
            if(err){
                if(cbs){
                    cbs(err, recordItem);
                }
            }else{
                //recordItem.set('id', res.insertId);
                if(cbs){
                    cbs(false, recordItem);
                }
            }
        });
    }

    function objectToQuery(self, model, queryData, cbs){
        console.log('BUILDING MYSQL STORE QUERY');
        console.log(queryData);
        var querySQL = 'SELECT ';
        var valueArray = [];
        
        if(queryData.fields){
            for(var i=0;i<queryData.fields.length;i++){
                querySQL+='`'+queryData.fields[i]+'`,';
            }
            querySQL=querySQL.substr(0, querySQL.length-1);
        }else{
            querySQL+='* ';
        }

        querySQL+=' FROM '+model.config.collection;
        
        if(queryData.joins){
            querySQL += ' INNER JOIN '+queryData.joins.model.config.collection+' ON '+model.config.collection+'.'+queryData.joins.field+' = '+queryData.joins.model.config.collection+'.'+queryData.joins.on+' ';
        }

        if(queryData.where){
            querySQL+=' WHERE ';

            for(var fieldName in queryData.where){
                var fieldCrit = queryData.where[fieldName];
                
                if(fieldCrit && (typeof fieldCrit)=='object'){
                    for(var fieldOp in fieldCrit){
                        switch(fieldOp){
                            case 'eq':
                                if(fieldCrit[fieldOp]===null){
                                    querySQL+= fieldName+' IS NULL AND ';
                                }else{
                                    if(Array.isArray(fieldCrit[fieldOp]) && fieldCrit[fieldOp].length>1){
                                        querySQL+=fieldName+' IN (?) AND ';
                                        valueArray.push(fieldCrit[fieldOp]);
                                    }else{
                                        if(Array.isArray(fieldCrit[fieldOp])){
                                            querySQL+=fieldName+'=? AND ';
                                            valueArray.push(fieldCrit[fieldOp][0]);
                                        }else{
                                            querySQL+=fieldName+'=? AND ';
                                            valueArray.push(fieldCrit[fieldOp]);
                                        }
                                        
                                    }
                                }
                                break;
                            case 'gt':
                                if(fieldCrit[fieldOp].length>1){
                                    querySQL+=fieldName+' IN (?) AND ';
                                }else{
                                    querySQL+=fieldName+'>? AND ';
                                    valueArray.push(fieldCrit[fieldOp][0]);
                                }
                                break;
                            case 'lt':
                                if(fieldCrit[fieldOp].length>1){
                                    querySQL+=fieldName+' IN (?) AND ';
                                }else{
                                    querySQL+=fieldName+'<? AND ';
                                    valueArray.push(fieldCrit[fieldOp][0]);
                                }
                                break;
                        }
                    }
                }else{
                    if(fieldCrit===null){
                        querySQL+=fieldName+' IS ? AND ';
                    }else{
                        if(fieldCrit.length>1){
                            querySQL+=fieldName+' IN (?) AND ';
                        }else{
                            querySQL+=fieldName+'=? AND ';
                        }
                    }
                    
                    valueArray.push(fieldCrit);
                }
            }

            if(querySQL.substr(querySQL.length-5, 5)==' AND '){
                querySQL = querySQL.substr(0, querySQL.length-5);
            }
        }

        if(queryData.order){
            querySQL+=' ORDER BY '+queryData.order;
        }

        if(queryData.limit || queryData.offset){
            querySQL+=' LIMIT ?, ?';
            valueArray.push(queryData.offset?queryData.offset:0);
            valueArray.push(queryData.limit?queryData.limit:50);
        }

        return {sql: querySQL+';', values: valueArray};
    }

module.exports = MySQLStore;