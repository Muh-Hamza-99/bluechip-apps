require("dotenv").config({ path: "./config.env" });

const express = require("express");
const app = express();

const { google } = require("googleapis");

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;

const session = require("express-session");
const flash = require("connect-flash");

const JOI = require("joi");

const path = require("path");
const ejsMate = require("ejs-mate");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  name: process.env.SESSION_NAME,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUnitialized: false,
  cookie: {
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
  }
}));

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.info = req.flash("info")
  next();
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  passReqToCallback: true,
},
  function (requst, accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_CLIENT_ID,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  callbackURL: process.env.FACEBOOK_CALLBACK_URL,
},
  function (accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

const isLoggedIn = (req, res, next) => {
  if (req.user) {
    next();
  } else {
    req.flash("info", "You have to login to contact us!");
    res.redirect("/login");
  }
};

const alreadyLoggedIn = (req, res, next) => {
  if (req.user) {
    req.flash("info", "You are already logged in!");
    res.redirect("/");
  } else {
    next();
  }
};

const contactSchema = JOI.object({
  contact: JOI.object({
    name: JOI.string().required(),
    email: JOI.string().email({ minDomainSegments: 2, tlds: { allow: ["com", "net", "edu"] } }),
    message: JOI.string().required().max(100),
  }).required(),
});

const validatedContact = (req, res, next) => {
  const { error } = contactSchema.validate(req.body);
  if (error) {
    const msg = error.details.map(el => el.message).join(", ");
    throw new ExpressError(msg, 400);
  } else {
    next();
  }
}

class ExpressError extends Error {
  constructor(message, statusCode) {
      super();
      this.message = message;
      this.statusCode = statusCode;
  };
};

app.get("/", (req, res) => {
  const currentUser = req.user;
  res.render("home", { currentUser });
});

app.get("/services", (req, res) => {
  const currentUser = req.user;
  res.render("main/services", { currentUser });
});

app.get("/apps", (req, res) => {
  const currentUser = req.user;
  res.render("main/apps", { currentUser });
})

app.get("/login", alreadyLoggedIn, (req, res) => {
  res.render("user/login");
});

app.get("/auth/google", passport.authenticate("google", { scope: ["email", "profile"] }));
app.get("/auth/facebook", passport.authenticate("facebook", { scopes: ["email", "profile"] }));

app.get("/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    req.flash("info", "Successfully logged in with Google!");
    res.redirect("/");
  }
);

app.get("/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  (req, res) => {
    req.flash("info", "Successfully logged in with Facebook!");
    res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.logout();
  req.session.destroy();
  res.redirect("/");
});

app.get("/contact", isLoggedIn, (req, res) => {
  const currentUser = req.user;
  res.render("main/contact", { currentUser });
});

app.post("/contact", validatedContact, async (req, res) => {
  const { name, email, message } = req.body.contact;
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });
  const client = await auth.getClient();
  const googleSheets = google.sheets({ version: "v4", auth: client });
  const spreadsheetID = process.env.SPREADSHEET_ID;
  await googleSheets.spreadsheets.values.append({
    auth,
    spreadsheetID,
    range: "Sheet1!A:B",
    valueInputOption: "USER_ENTERED",
    resource: {
      values: [[name, email, message]],
    }
  });
  req.flash("success", "Your message has been sent to BlueChip Apps Team!");
  res.redirect("/");

});

app.all("*", (req, res, next) => {
  next(new ExpressError("Page Not Found", 404));
});

app.use((err, req, res, next) => {
  const { statusCode } = err;
  if (!err.message) err.message = "Oh no, something went wrong!";
  res.status(statusCode).render("error", { err });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log("Server is on!"));