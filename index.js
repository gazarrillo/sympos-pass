const { Template } = require("@walletpass/pass-js");
const fs = require('fs');
const crypto = require('crypto');

async function generatePass() {
	
	console.log("Generating pass...");

	// creates template
	const template = await Template.load("./template");
	await template.loadCertificate("certs/certificate.pem", '110500gz');
	await template.images.load("./images");
	
	// creates pass from template
	pass = template.createPass({
		serialNumber: crypto.randomUUID()
	});

	// customize pass
	pass.primaryFields.add({
        "key": "name",
        "value": "Giovanni Zarrillo",
        "label": "Name"
    });
	pass.primaryFields.add({
        "key": "id",
        "value": "27693155",
        "label": "ID"
    });

	// add qr code
	pass.barcodes = [{"message": pass.serialNumber, "format": "PKBarcodeFormatQR", messageEncoding: "iso-8859-1"}];
		
	// save pass to file
	const buf = await pass.asBuffer();
	fs.writeFile("./passes/pass.pkpass", buf, () => { });
	
	console.log("Pass generated! Serial Number: " + pass.serialNumber);
}

generatePass();