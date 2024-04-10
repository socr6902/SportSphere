// ----------------------------------   DEPENDENCIES  ----------------------------------------------
const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const path = require('path');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt'); //  To hash passwords

// -------------------------------------  APP CONFIG   ----------------------------------------------

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
});

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
// set Session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: true,
    resave: true,
  })
);
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

// -------------------------------------  DB CONFIG AND CONNECT   ---------------------------------------
const dbConfig = {
  host: 'db',
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};
const db = pgp(dbConfig);

// db test
db.connect()
  .then(obj => {
    // Can check the server version here (pg-promise v10.1.0+):
    console.log('Database connection successful');
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR', error.message || error);
  });
//-------------------------------------  ROUTES for register.hbs   ----------------------------------------------

app.get('/register', (req, res) => {
  res.render('pages/register');
})
// app.post('/register', async (req, res) => {
//   const hash = await bcrypt.hash(req.body.password, 10);
//   db.none('INSERT INTO users(username, password, dob) VALUES($1, $2, $3)', [req.body.username, hash, req.body.dob])
//       .then(() => {
//           console.log("Registered User")
          
//           res.status(400).send('Success').redirect('login');
//       })
//       .catch(error => {
//           res.status(302).render('pages/register', { message: 'Error Registering User' });
//       });
// })
// app.post('/register', async (req, res) => {
//   const hash = await bcrypt.hash(req.body.password, 10);
//   db.none('INSERT INTO users(username, password, dob) VALUES($1, $2, $3)', [req.body.username, hash, req.body.dob])
//       .then(() => {
//           console.log("Registered User")
//           res.status(302)
//           res.redirect('/login');
//       })
//       .catch(error => {
//           res.status(302).render('pages/register', { message: 'Error Registering User' });
//       });
// })

// Register
app.post('/register', async (req, res) => {
  //hash the password using bcrypt library
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await db.none('INSERT INTO users (username, password, dob) VALUES ($1, $2, $3)', [req.body.username, hash, req.body.dob]);
    console.log("Registered User")
              res.status(302);
              res.redirect('/login');
  }
  catch(err){
    console.error('Error registering user:', err);
    //redirect if registration fails
    res.status(302).render('pages/register', { message: 'Error Registering User' });
  }
 });
const user = {
  username: undefined,
  password: undefined,
  datetime_created: undefined,
};

//-------------------------------------  DEFAULT ROUTE   ----------------------------------------------

app.get('/', (req, res) => {
  res.redirect('/register'); //this will call the /anotherRoute route in the API
});



app.get('/login', (req, res) => {
  console.log('openening login page')
  res.render('pages/login');
});
//-------------------------------------  LOGIN ----------------------------------------------

app.post('/login', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  // Query to find user by username
  const query = 'SELECT * FROM users WHERE username = $1 LIMIT 1';
  const values = [username];

  try {
      // Retrieve user from the database
      const user = await db.oneOrNone(query, values);

      if (!user) {
          // User not found, render login page with error message
          return res.redirect('/register');
      }

      // Compare password
      const passwordMatch = await bcrypt.compare(req.body.password, user.password);

      if (!passwordMatch) {
          // Incorrect password, render login page with error message
          return res.render('pages/login', { message: 'Incorrect password' });
      }

      // Save user in session
      req.session.user = user;
      req.session.save();

      // Redirect to home page
      res.redirect('/home');
  } catch (err) {
      // Error occurred, redirect to login page
      console.log(err);
      res.redirect('/register');
  }
});

app.get('/home' , async (req, res) => {
  res.render('pages/home');
});

app.get('/sports' , async (req, res) => {
  res.render('pages/Sports/nfl');
});

// -------------------------------------  ROUTES for bets.hbs   ----------------------------------------------
app.get('/bets', async (req, res) => {

  // ALWAYS CHECK IF THE USER IS LOGGED IN OR THERE IS NO DATA TO DISPLAY! IT WILL CRASH
  if (!req.session.user) {
    // Redirect to login page
    return res.redirect('/login');
  }


  const sport_result = await db.any('SELECT sport_name FROM sports');
  const sports = sport_result.map(sport => sport.sport_name);

  const broker_result = await db.any('SELECT broker_name FROM brokers');
  const brokers = broker_result.map(broker => broker.broker_name);

  // const bets = await db.any(`SELECT datetime, sport_name, broker_name, stake, odds, profit
  //   FROM bets join sports on bets.sport_id = sports.sport_id join brokers on bets.broker_id = brokers.broker_id
  //   WHERE username = $1`, [req.session.user.username]);

  const bets = await db.any('select * from bets')

  console.log(bets);

  res.render('pages/bets', { sports, brokers, bets });
});


app.post('/bets', async (req, res) => {
  const { event, broker, amount, odds_sign, odds, outcome } = req.body;
  console.log(req.body);
  // get the + or - sign from the team name and convert to integer
  const odds_sign_int = odds_sign === '+' ? 1 : -1;
  // if won, profit = stake * odds, if lost, profit = -stake
  if (outcome === 'won') {
    profit = amount * odds_sign_int * odds[1];
  } else {
    profit = -amount;
  }
  const username = req.session.user.username;
  const datetime = new Date().toISOString();
  const sport_id = await db.one('SELECT sport_id FROM sports WHERE sport_name = $1', [event]);
  const broker_id = await db.one('SELECT broker_id FROM brokers WHERE broker_name = $1', [broker]);
  await db.none('INSERT INTO bets (sport_id, broker_id, username, stake, datetime, odds, profit) VALUES ($1, $2, $3, $4, $5, $6, $7)', [sport_id.sport_id, broker_id.broker_id, username, amount, datetime, odds, profit]);
  res.redirect('/bets');
});


// -------------------------------------  TEST ROUTE ----------------------------------------------

app.get('/welcome', (req, res) => {
  res.json({status: 'success', message: 'Welcome!'});
});

// -------------------------------------  TEST ROUTE ----------------------------------------------



// Authentication middleware.
const auth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

app.use(auth);




// -------------------------------------  ROUTE for logout.hbs   ----------------------------------------------

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.render('pages/logout');
});


// -------------------------------------  START THE SERVER   ----------------------------------------------

module.exports = app.listen(3000);
console.log('Server is listening on port 3000');