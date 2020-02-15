const googleTrends = require('google-trends-api'); 
const express = require("express");
const bodyParser = require("body-parser");
const Datastore = require('nedb')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws');
let server = require('http').createServer();
var https = require('https');

//Application Settings
function getConfig(v,d){ //value and default if missing config
    if (fs.existsSync('config.json')) {
        var file_contents = fs.readFileSync('config.json')
        var file_json = JSON.parse(file_contents)
        if (file_json[v]){
            return file_json[v];
        }else{
            return d ;
        }
    }else{
        return d ;
    }
}

db = new Datastore({ filename: 'db/source.db', autoload: true });
cfg = new Datastore({ filename: 'db/cfg.db', autoload: true });
var M = {};

var googleit = function(query) { 
    return new Promise(function(resolve, reject){
        googleTrends.interestOverTime({keyword: query })
        .then(function(results){
            resolve(results);
        })
        .catch(function(err){
            reject(err);
        });
    });
}

var googleitGeo = function(query) { 
    return new Promise(function(resolve, reject){
        googleTrends.interestByRegion({keyword: query })
        .then(function(results){
            resolve(results);
        })
        .catch(function(err){
            reject(err);
        });
    });
}

var app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, DELETE")
    next();
});

app.use(express.static('public'));

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

app.post("/search", function(req, res, next){
    console.log(req.body.id)
    var searchterm = req.body.id
    googleit(req.body.id).then(function(value){
        //Add data to database
        v = JSON.parse(value)
        for(i=0;i<v["default"]["timelineData"].length;i++){
            v["default"]["timelineData"][i].search_term = searchterm;
            v["default"]["timelineData"][i].update = 1;
            v["default"]["timelineData"][i].value = v["default"]["timelineData"][i].value[0];
            delete v["default"]["timelineData"][i].time
            delete v["default"]["timelineData"][i].formattedTime
            delete v["default"]["timelineData"][i].formattedValue
            delete v["default"]["timelineData"][i].hasData
            delete v["default"]["timelineData"][i].axisNote
        };
        
        db.insert(v.default.timelineData, function (err, newDoc) {
            if(err){
                res.sendStatus(202)
                res.end(err);
            }else{
                console.log("DB Insert")
                res.sendStatus(201) 
                res.end(v["default"]["timelineData"].length)  
            };
        });
    },function(err){
        res.sendStatus(401)
        res.end(err);
    });
});

app.post("/searchgeo", function(req, res, next){
    //console.log(req.body.id)
    var searchterm = req.body.id
    googleitGeo(req.body.id).then(function(value){
        //Add data to database
        v = JSON.parse(value)
        for(i=0;i<v["default"]["geoMapData"].length;i++){
            v["default"]["geoMapData"][i].search_term = searchterm;
            v["default"]["geoMapData"][i].update = 1;
            v["default"]["geoMapData"][i].value = v["default"]["geoMapData"][i].value[0];
            delete v["default"]["geoMapData"][i].coordinates
            delete v["default"]["geoMapData"][i].maxValueIndex
            delete v["default"]["geoMapData"][i].formattedValue
            delete v["default"]["geoMapData"][i].hasData
            delete v["default"]["geoMapData"][i].axisNote
        };
        
        db.insert(v.default.geoMapData, function (err, newDoc) {
            if(err){
                res.sendStatus(202)
                res.end(err);
            }else{
                console.log("DB Insert")
                res.sendStatus(201) 
                res.end(v["default"]["geoMapData"].length)  
            };
        });
    },function(err){
        res.sendStatus(401)
        res.end(err);
    });
});

app.delete("/search", function(req, res, next){
    var deleteterm = req.body.id
    if (deleteterm == "*"){
         qry = ''
    }else{
        qry = 'search_term: "'+ deleteterm + '"';
    };
    console.log(qry)
        eval(`db.remove({${qry}}, {multi:true},function (err, newDoc) {
                if(err){
                    res.sendStatus(202)
                    res.end(err);
                }else{
                    console.log("DB Remove")
                    res.sendStatus(201) 
                    res.end()  
                };
            });
        `)
});

app.get("/", function(req, res, next){
    res.end('GTrend Server: Connection Successful.');
});

app.get("/start", function(req, res, next){
    res.sendFile(path.join(__dirname + '/public/index.html'));
 });

 app.post("/searchcomplete", function(req, res, next){
    console.log('Send Reload Command.')
    //M.ws.send('Reload.');
    //Cloud Version - update cfg via api first.
    cfg.find({},function(err,docs){
         
        const options = {
            hostname: docs[0].hostname,
            port: "443",
            path: docs[0].path,
            rejectUnauthorized: false,
            method: "POST",
            headers: {
                "Authorization": docs[0].bearer
                }
            }
    
    
        var req = https.request(options, res => {
          console.log(res.statusCode)
          var body = '';
          res.on('data', function(chunk) {
            body += chunk;
          });
          res.on('end', function() {
            console.log(body);
          });
        })
    
        req.on('error', error => {
          console.error(error)
        })
        
        req.write('{"appid":"' + docs[0].appid + '"}')
        req.end()

        res.sendStatus(201);
        res.end();
    });
});

app.post("/setcfg", function(req, res, next){
    cfg.remove({}, { multi: true }, function (err, numRemoved){
        cfg.insert(req.body, function (err, newDoc) {
            console.log("Updated config.")
            res.sendStatus(201);
            res.end();
        });
    });
    
})

app.get("/timeline/:id", function(req, res, next){
    if(req.params.id == '1'){
        var filter = 1 //Partial
        console.log("Partial")
    }else if (req.params.id == '0'){
        var filter = 0 //Full
        console.log("Sync")
    };
    //Retrieve results - function async
    var getResults = function() {
        return new Promise(function(resolve, reject){
            //DB query, greater than filter 0 or 1. 1 for new data, 0 for all.
            db.find({update: { $gte: filter}},function(err,docs){
                resolve(docs); //return all results
            });
        });
    }
    //Retrieve result now
    getResults().then(function(value){
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(value));
        //Change update to 0 because data is not new anymore.
        db.update({update: 1}, {$set: {update: 0}},{multi: true},function(numReplaced){
            console.log("Updated records " + numReplaced)
        });
    })
});

//Easier Exit for non-node users. Press q to exit
/*
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q') {
        process.exit();
    }
})
*/

//Added for Heroku
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3035;
}



//WebSocker Server
const wss = new WebSocket.Server({ server: server});

server.on('request', app);

wss.on('connection', function connection(ws) {
    M.ws = ws;
    ws.on('message', function incoming(message) {
        //Message Back from Client
        if(message == 'Send Handshake.'){
            console.log('Received %s', message)
            ws.send('Handshake Received.');
        }
        
    }); 
});  


//app.listen(getConfig('port',3035), () => {
server.listen(port, () => {
    console.log("Application: gtrends mediation server")
    console.log("Author: antman-oss")
    console.log("Server running on port " + port);//getConfig('port',3035));
    //console.log("Press 'q' to QUIT.")
});

