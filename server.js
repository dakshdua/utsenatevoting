const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');

const corsOptions = {
  'origin': 'utsenate.squarespace.com',
  'methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
  'preflightContinue': false,
  'optionsSuccessStatus': 204,
  'credentials': true,
  'allowedHeaders': 'Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization, DNT, Referer'
}

app.use(helmet());
app.use(cors(corsOptions), bodyParser.json());
var councils = undefined;

app.post('/adminCouncils', (req, res) => {
  console.log('Path: /adminCouncils');
  res.send('this is an secure server');
  councils = req && req.body;
  console.log('%s', councils);
});

app.get('/councils', (req, res) => {
  console.log('Path: /councils');
  if(councils && Object.keys(councils)) {
    res.send(JSON.stringify(Object.keys(councils).sort()));
  } else {
    res.send(JSON.stringify({'failed': true}));
  }
});

let port = process.env.PORT;
if (port == null || port == "") {
  port = 8080;
}
app.listen(port);
