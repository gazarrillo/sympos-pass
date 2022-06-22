const { Template } = require("@walletpass/pass-js");
const fs = require("fs");
const crypto = require("crypto");
const prompt = require("prompt-sync")();

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
        snapshot.val()[attendee].firstName,
        snapshot.val()[attendee].lastName,
        snapshot.val()[attendee].id,
        serial
      );
    }
  } else {
    console.log("Event not found");
  }
});

async function generatePass(firstName, lastName, id, serial) {
  // creates template
  const template = await Template.load("./template");
  await template.loadCertificate("certs/certificate.pem", "110500gz");
  await template.images.load("./images");

  // creates pass from template
  pass = template.createPass({
    serialNumber: serial,
  });

  // customize pass
  pass.primaryFields.add({
    key: "name",
    value: firstName + " " + lastName,
    label: "Name",
  });

  if (id != null) {
    pass.primaryFields.add({
      key: "id",
      value: id,
      label: "ID",
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
  uploadBytes(sref(storage, "events/" + eventID + "/" + serial + ".pkpass"), buf).then(
    () => {
      console.log("Pass: " + serial + " uploaded!");
    }
  );
}
