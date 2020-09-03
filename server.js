const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const basicAuth = require('express-basic-auth');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const pgp = require('pg-promise')({});

const cn = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5
};
const db = pgp(cn);

db.any('SELECT NOW()')
  .then(data => {
    console.log(data);
  })
  .catch(err => {
    console.log(err);
  });

const corsOptions = {
  'origin': ['https://utsenate.squarespace.com', 'https://utsenate.org'],
  'methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
  'preflightContinue': false,
  'optionsSuccessStatus': 204,
  'credentials': true,
  'allowedHeaders': 'Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization, DNT, Referer'
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(bodyParser.json());

app.get('/councils', (req, res) => {
  console.log('Path: /councils');
  db.any('SELECT name FROM councils')
    .then(data => {
      console.log(data);
      if (data.length === 0) {
        res.sendStatus(409);
      } else {
        var councils = [];
        data.forEach(function(council) {
          councils.push(council.name);
        });
        console.log("sending %s", councils);
        res.send(JSON.stringify(councils.sort()));
      }
    })
    .catch(err => {
      console.log(err);
      res.sendStatus(500);
    });
});

app.get('/vote', (req, res) => {
  console.log('Path: GET /vote');
  db.multi(`SELECT
              item, type, active
            FROM
              agenda_items
            ORDER BY id;

            SELECT
              name
            FROM
              councils;

            SELECT
              votes.value AS value,
              councils.name AS name,
              agenda_items.item AS item
            FROM
              votes
            INNER JOIN councils ON councils.id = votes.council_id
            INNER JOIN agenda_items ON agenda_items.id = votes.item_id
            ORDER BY agenda_items.id`)
    .then(data => {
      console.log(data);
      var [agenda_items_data, councils_data, votes_data] = data;
      if (councils_data.length === 0 || agenda_items_data.length === 0) {
        res.sendStatus(409);
      } else {
        var agendaItems = [];
        var currentItem = 0;
        var currentVote = 0;
        var item = agenda_items_data[currentItem];
        while (item) {
          var agendaItem = new Object();
          agendaItem.item = item.item;
          agendaItem.type = item.type;
          agendaItem.active = item.active;
          agendaItem.councils = new Object();
          if (agendaItem.active) {
            agendaItem.result = 'In Progress';
            item = false;
            while (currentVote < votes_data.length && votes_data[currentVote].item === item.item) {
              var vote = votes_data[currentVote];
              agendaItem.councils[vote.name] = 'Voted';
              currentVote++;
            }
          } else {
            agendaItem.Aye = 0;
            agendaItem.Nay = 0;
            agendaItem.Abstain = 0;
            while (currentVote < votes_data.length && votes_data[currentVote].item === item.item) {
              var vote = votes_data[currentVote];
              agendaItem[vote.value]++;
              agendaItem.councils[vote.name] = vote.value;
              currentVote++;
            }
            currentItem++;
            item = agenda_items_data[currentItem];
            if (agendaItem.type === 'Bill') {
              agendaItem.result = agendaItem.Yes > 2 * (agendaItem.No + agendaItem.Abstain) ? 'Passed' : 'Failed';
            } else {
              agendaItem.result = agendaItem.Yes > (agendaItem.No + agendaItem.Abstain)  ? 'Passed' : 'Failed';
            }
          }
          agendaItems.push(agendaItem);
        }
        var tableInfo = new Object();
        tableInfo.agendaItems = agendaItems;
        for(var i = 0; i < councils_data.length; i++) {
          councils_data[i] = councils_data[i].name;
        }
        tableInfo.councils = councils_data;
        res.send(JSON.stringify(tableInfo));
      }
    })
    .catch(err => {
      console.log(err);
      res.sendStatus(500);
    });
});

app.post('/adminAuth', basicAuth({users: {'admin': process.env.ADMIN_PASS}}), (req, res) => {
  console.log('Path: /adminAuth');
  var token = jwt.sign({ user: 'admin' }, process.env.JWT_SECRET, {expiresIn: 180 * 60});
  res.cookie('token', token, {
    maxAge:  180 * 60 * 1000,
    secure: true, // set to true if your using https
    httpOnly: true,
    sameSite: 'none',
  });
  res.sendStatus(200);
  console.log('Auth: %s', req.header('Authorization'));
});

function myAuthorizer(username, password, cb) {
  db.oneOrNone('SELECT password FROM councils WHERE name=$1', username)
    .then(data => {
      console.log(data);
      if (data) {
        bcrypt.compare(password.toUpperCase(), data.password)
          .then(result => {
            console.log(result);
            cb(null, result)
          })
          .catch(err => {
            console.log(err);
            cb(err, false);
          });
      } else {
        console.log('no data');
        cb(null, false);
      }
    })
    .catch(err => {
      console.log(err);
      cb(err, null);
    });
}

app.post('/auth', basicAuth({authorizer: myAuthorizer, authorizeAsync: true}), (req, res) => {
  console.log('Path: /auth');
  var token = jwt.sign({ user: req.auth.user }, process.env.JWT_SECRET, {expiresIn: 180 * 60});
  res.cookie('token', token, {
    maxAge: 180 * 60 * 1000,
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
  });
}

app.use(authenticateToken);

app.post('/adminCouncils', (req, res) => {
  console.log('Path: /adminCouncils');
  if(req.payload.user !== 'admin') {
    res.sendStatus(401);
  } else if (req.body) {
    const cs = new pgp.helpers.ColumnSet(['name', 'password'], {table: 'councils'});
    console.log(req.body);
    req.body.forEach(function(council) {
      council.password = bcrypt.hashSync(council.password.toUpperCase(), 3);
    });
    const query = pgp.helpers.insert(req.body, cs);
    db.multi('TRUNCATE TABLE votes; TRUNCATE TABLE councils CASCADE; TRUNCATE TABLE agenda_items CASCADE;' + query)
      .then(data => {
        res.sendStatus(200);
      })
      .catch(err => {
        console.log(err);
        res.sendStatus(500);
      });
  } else {
    res.sendStatus(400);
  }
});

app.post('/agendaItem', (req, res) => {
  console.log('Path: /agendaItem');
  if(req.payload.user !== 'admin') {
    res.sendStatus(401);
  } else if (req.body && req.body.agendaItem && req.body.type) {
    db.multi('UPDATE agenda_items SET active = FALSE WHERE id IN (SELECT MAX(id) FROM agenda_items); INSERT INTO agenda_items(item, type) VALUES($1, $2)', [req.body.agendaItem, req.body.type])
      .then(data => {
        res.sendStatus(200);
      })
      .catch(err => {
        console.log(err);
        res.sendStatus(500);
      });
  } else {
    res.sendStatus(400);
  }
});

app.post('/end', (req, res) => {
  console.log('Path: /agendaItem');
  if(req.payload.user !== 'admin') {
    res.sendStatus(401);
  } else {
    db.none('UPDATE agenda_items SET council_count=current_council_count, active=FALSE WHERE id IN (SELECT MAX(id) FROM agenda_items)')
      .then(data => {
        res.sendStatus(200);
      })
      .catch(err => {
        console.log(err);
        res.sendStatus(500);
      });
  }
});

app.post('/vote', (req, res) => {
  console.log('Path: POST /vote');
  console.log('%s', req.body);
  if(req.body && req.body.agendaItem && (req.body.vote === 'Aye' || req.body.vote === 'Nay' || req.body.vote === 'Abstain')) {
    db.multi(`SELECT
                id  AS council_id
              FROM councils
              WHERE name = $1;

              SELECT
                id AS item_id,
                active AS item_active
              FROM agenda_items
              WHERE item = $2`,
          [req.payload.user, req.body.agendaItem])
      .then((council_data, item_data) => {
        if (!item_data.item_active || council_data.length === 0) {
          res.sendStatus(401);
        } else if (item_data.length === 0) {
          res.sendStatus(409);
        } else {
          db.none('INSERT INTO votes(council_id, item_id, value) VALUES($1, $2, $3)', [council_data[0].council_id, item_data[0].item_id, req.body.vote])
            .then(data => {
              res.sendStatus(200);
            })
            .catch(err => {
              console.log(err);
              res.sendStatus(500);
            });
        }
      })
      .catch(err => {
        console.log(err);
        res.sendStatus(500);
      });
  } else {
    res.sendStatus(400);
  }
});

let port = process.env.PORT;
if (port == null || port == '') {
  port = 5000;
}
app.listen(port);
