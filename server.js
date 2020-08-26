const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const basicAuth = require('express-basic-auth');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect().catch(err =>
  console.log('%s', err)
);

/*client.query('DROP TABLE IF EXISTS questions; CREATE TABLE questions();', (err, res) => {
  if (err)  {
    console.log(' %s', err);
  } else {
    for (let row of res.rows) {
      console.log(JSON.stringify(row));
    }
    client.end();
  }
}); */

const corsOptions = {
  'origin': ['https://utsenate.squarespace.com', 'https://utsenate.org'],
  'methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
  'preflightContinue': false,
  'optionsSuccessStatus': 204,
  'credentials': true,
  'allowedHeaders': 'Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization, DNT, Referer'
}

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(bodyParser.json());
var councils = undefined;
var agendaItems = [];
var votes = [];
var currentItem = undefined;

app.get('/councils', (req, res) => {
  console.log('Path: /councils');
  if(councils && Object.keys(councils)) {
    res.send(JSON.stringify(Object.keys(councils).sort()));
  } else {
    res.sendStatus(409);
  }
});

app.get('/vote', (req, res) => {
  console.log('Path: GET /vote');
  if (agendaItems) {
    var publicVoteInfo = new Object();
    agendaItems.forEach((agendaItem, i) => {
      if (agendaItem !== currentItem) {
        publicVoteInfo[agendaItem.item] = agendaItem;
      } else {
        publicVoteInfo[agendaItem.item] = 'In Progress';
      }
    });
    res.send(JSON.stringify(publicVoteInfo));
  } else {
    res.sendStatus(400);
  }
});

app.post('/adminAuth', basicAuth({users: {'admin': process.env.ADMIN_PASS}}), (req, res) => {
  console.log('Path: /adminAuth');
  var token = jwt.sign({ user: 'admin' }, process.env.JWT_SECRET, {expiresIn: 300});
  res.cookie('token', token, {
    maxAge: 300 * 1000,
    secure: true, // set to true if your using https
    httpOnly: true,
    sameSite: 'none',
  });
  res.sendStatus(200);
  console.log('Auth: %s', req.header('Authorization'));
});

function myAuthorizer(username, password) {
  for (var council of Object.keys(councils)) {
    const userMatches = basicAuth.safeCompare(username, council);
    const passwordMatches = basicAuth.safeCompare(password, councils[council][0]);
    if (userMatches && passwordMatches) {
      return true;
    }
  }
  return false;
}

app.post('/auth', basicAuth({authorizer: myAuthorizer}), (req, res) => {
  console.log('Path: /auth');
  var token = jwt.sign({ user: req.auth.user }, process.env.JWT_SECRET, {expiresIn: 300});
  res.cookie('token', token, {
    maxAge: 300 * 1000,
    secure: true, // set to true if your using https
    httpOnly: true,
    sameSite: 'none',
  });
  res.sendStatus(200);
  console.log('Auth: %s', req.header('Authorization'));
});

function authenticateToken(req, res, next) {
  var token = req && req.cookies.token || '';
  if (!token) {
    console.log('no token');
  }
	jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
		if (err instanceof jwt.JsonWebTokenError) {
			// if the error thrown is because the JWT is unauthorized, return a 401 error
			return res && res.sendStatus(401);
		} else if (err) {
      return res && res.sendStatus(400);
    }
    req.payload = decoded;
    console.log('Payload: %s', req.payload);
    next(); // pass the execution off to whatever request the client intended
  })
}

app.use(authenticateToken);

app.post('/adminCouncils', (req, res) => {
  console.log('Path: /adminCouncils');
  if(req.payload.user !== 'admin') {
    res.sendStatus(401);
  } else if (req.body) {
    councils = req.body;
    for (var council of Object.keys(councils)) {
      var councilData = [];
      councilData.push(councils[council]);
      councilData.push(false);
      councils[council] = councilData;
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
  console.log('%s', councils);
});

app.post('/agendaItem', (req, res) => {
  console.log('Path: /agendaItem');
  if(req.payload.user !== 'admin') {
    res.sendStatus(401);
  } else if (req.body && req.body.agendaItem) {
    var agendaItem = new Object();
    for (var council of Object.keys(councils)) {
      councils[council][1] = false;
    }
    agendaItem.item = req.body.agendaItem;
    agendaItem['Yes'] = 0;
    agendaItem['No'] = 0;
    agendaItem['Abstain'] = 0;
    agendaItems.push(agendaItem);
    currentItem = agendaItem;
    console.log(req.body.agendaItem);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

app.post('/vote', (req, res) => {
  console.log('Path: POST /vote');
  console.log('%s', req.body);
  if (councils && req.body && req.payload.user && councils[req.payload.user]) {
    if (req.body.agendaItem && req.body.vote && req.body.agendaItem === currentItem.item) {
      if(req.body.vote === 'Yes' || req.body.vote === 'No' || req.body.vote === 'Abstain' && !councils[req.payload.user][1]) {
          currentItem[req.body.vote]++;
          currentItem[req.payload.user] = req.body.vote;
          councils[req.payload.user][1] = true;
          res.sendStatus(200);
          return;
      }
    }
  }
  res.sendStatus(400);
});

let port = process.env.PORT;
if (port == null || port == '') {
  port = 5000;
}
app.listen(port);
