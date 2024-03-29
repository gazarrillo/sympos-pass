const { Template } = require("@walletpass/pass-js");
const fs = require("fs");
const crypto = require("crypto");
const prompt = require("prompt-sync")();
const nodemailer = require("nodemailer");
const symbology = require("symbology");

// firebase
const initializeApp = require("firebase/app").initializeApp;
const getDatabase = require("firebase/database").getDatabase;
const getStorage = require("firebase/storage").getStorage;
const sref = require("firebase/storage").ref;
const uploadBytes = require("firebase/storage").uploadBytes;
const ref = require("firebase/database").ref;
const get = require("firebase/database").get;
const set = require("firebase/database").set;
const child = require("firebase/database").child;
const firebaseConfig = require("./firebaseConfig.json");

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

const eventID = prompt("Enter event ID: ");

// get event data from database
get(child(ref(db), "events/" + eventID)).then((snapshot) => {
  if (snapshot.exists()) {
    for (attendee in snapshot.val()) {
      // generates a serial number for each attendee
      serial = crypto.randomUUID();
      // update database with serial number and checked in status
      set(ref(db, "events/" + eventID + "/" + attendee + "/serial"), serial);
      set(ref(db, "events/" + eventID + "/" + attendee + "/checkedIn"), false);
      //generate pass for each attendee
      generatePass(
        snapshot.val()[attendee].name,
        snapshot.val()[attendee].size,
        serial
      );
      //send email to each attendee
      // Inside your snapshot.exists() loop
      sendEmail(snapshot.val()[attendee].email, snapshot.val()[attendee].name, serial, eventID);
    }
  } else {
    console.log("Event not found");
  }
});

async function generatePass(name, size, serial) {
  // creates template
  const template = await Template.load("./template");
  await template.loadCertificate("certs/certificate.pem", "1234");
  await template.images.load("./images");

  // creates pass from template
  pass = template.createPass({
    serialNumber: serial,
  });

  // customize pass
  pass.primaryFields.add({
    key: "name",
    value: name,
    label: "Name",
  });

  if (size != null) {
    pass.secondaryFields.add({
      key: "id",
      value: size,
      label: "Talla",
    });
  }

  // add qr code
  pass.barcodes = [
    {
      message: pass.serialNumber,
      format: "PKBarcodeFormatAztec",
      messageEncoding: "iso-8859-1",
    },
  ];

  // save pass
  const buf = await pass.asBuffer();

  // upload passes to firebase storage
  await uploadBytes(
    sref(storage, `events/${eventID}/${serial}/${serial}.pkpass`),
    buf
  );

  console.log("Pass generated:" + serial);
}

// generate aztec code png for each attendee
async function generateAztecCode(serial) {
  try {
    const result = await symbology.createStream(
      {
        symbology: symbology.SymbologyType.AZTEC,
        encoding: symbology.EncodingMode.UNICODE_MODE,
        showHumanReadableText: false,
        scale: 3.0,
      },
      serial,
      symbology.OutputType.PNG,
    );

    // Convert base64 string to Blob/Buffer
    const base64Content = result.data.split(';base64,').pop(); // Remove the "data:image/png;base64," part
    const buf = Buffer.from(base64Content, 'base64');

    // upload png to firebase storage
    await uploadBytes(
      sref(storage, `events/${eventID}/${serial}/${serial}.png`),
      buf
    );
  } catch (error) {
    console.error(error);
    throw error;
  }
}


async function sendEmail(email, name, serial, eventID) {

  await generateAztecCode(serial);

  // create transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: "smtp.forwardemail.net",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: "*@sympos.app",
      pass: "a62da15360c9705bf2bed657",
    },
  });

  const barcodeURL = `https://firebasestorage.googleapis.com/v0/b/sympos-fb5b3.appspot.com/o/${encodeURIComponent(`events/${eventID}/${serial}/${serial}.png`)}?alt=media`;
  const passUrl = `https://firebasestorage.googleapis.com/v0/b/sympos-fb5b3.appspot.com/o/${encodeURIComponent(`events/${eventID}/${serial}/${serial}.pkpass`)}?alt=media`;
  
  // import html file
  let htmlTemplate = fs.readFileSync("./template/emailTemplate.html", "utf8");

  // replace placeholders with actual data
  htmlTemplate = htmlTemplate.replace("{{barcodeURL}}", barcodeURL);
  htmlTemplate = htmlTemplate.replace("{{barcodeURL}}", barcodeURL);
  htmlTemplate = htmlTemplate.replace("{{passURL}}", passUrl);
  htmlTemplate = htmlTemplate.replace("{{name}}", name);

  let info = await transporter.sendMail({
    from: "'Liga Universitaria de Padel' pass@sympos.app", // sender address
    to: email,
    subject: "Registro Liga Universitaria de Padel", // Subject line
    html: htmlTemplate,
  });

  console.log("Email sent: " + info.messageId);

  // wait for 1 second to avoid rate limiting
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
