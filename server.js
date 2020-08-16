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
  'origin': 'https://utsenate.squarespace.com',
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

app.get('/councils', (req, res) => {
  console.log('Path: /councils');
  if(councils && Object.keys(councils)) {
    res.send(JSON.stringify(Object.keys(councils).sort()));
  } else {
    res.sendStatus(409);
  }
});


app.post('/adminAuth', basicAuth({users: {'admin': process.env.ADMIN_PASS}}), (req, res) => {
  console.log('Path: /adminAuth');
  var token = jwt.sign({ admin: true }, process.env.JWT_SECRET, {expiresIn: 300});
  res.cookie('token', token, {
    maxAge: 300 * 1000,
    secure: true, // set to true if your using https
    httpOnly: true,
    sameSite: "none",
  });
  res.sendStatus(200);
  console.log('Auth: %s', req.header('Authorization'));
});

function myAuthorizer(username, password) {
  for (var council of Object.keys(councils)) {
    const userMatches = basicAuth.safeCompare(username, council);
    const passwordMatches = basicAuth.safeCompare(password, councils[council]);
    if (userMatches && passwordMatches) {
      return true;
    }
  }
  return false;
}

app.post('/auth', basicAuth({authorizer: myAuthorizer}), (req, res) => {
  console.log('Path: /auth');
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
  if (req.body) {
    councils = req.body;
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
  console.log('%s', councils);
});

app.post('/vote', (res, req) => {
  console.log('Path: /vote');
  if (req.body) {
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

let port = process.env.PORT;
if (port == null || port == '') {
  port = 5000;
}
app.listen(port);
