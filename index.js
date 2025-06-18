const express = require("express");
const fs = require("fs");
const moment = require("moment");
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const P = require("pino");

const app = express();
const PORT = process.env.PORT || 8080;

let Ren;
let whatsappStatus = false;

app.get("/addsender", async (req, res) => {
  const { number: numberTarget, apikey, session: sessionName = "session" } = req.query;

  if (!numberTarget || !apikey) {
    return res.status(400).json({
      result: false,
      message: "Missing required parameters: 'number' and/or 'apikey'."
    });
  }

  if (apikey !== "XX") {
    return res.status(403).json({
      result: false,
      message: "Invalid API Key."
    });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionName);
    const { version } = await fetchLatestBaileysVersion();

    Ren = makeWASocket({
      version,
      logger: P({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Ubuntu", "Chrome", "24.0.1"]
    });

    Ren.ev.on("creds.update", saveCreds);

    Ren.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const reason =
          lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason;
        if (
          reason === DisconnectReason.loggedOut ||
          reason === DisconnectReason.connectionClosed
        ) {
          whatsappStatus = false;
          try {
            fs.unlinkSync(`./${sessionName}/creds.json`);
          } catch (_) {}
        } else {
          whatsappStatus = false;
        }
      } else if (connection === "open") {
        whatsappStatus = true;
      }
    });

    setTimeout(async () => {
      if (!fs.existsSync(`./${sessionName}/creds.json`)) {
        try {
          const formattedNumber = numberTarget.replace(/\D/g, "");
          const pairingCode = await Ren.requestPairingCode(formattedNumber);
          const formattedCode =
            pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode;

          return res.json({
            result: true,
            author: "appoloCrasher",
            apikey,
            Date: moment().format("DD-MM-YYYY HH:mm:ss"),
            codepairing: formattedCode
          });
        } catch (error) {
          return res.status(500).json({
            result: false,
            message: `Error generating code: ${error.message}`
          });
        }
      } else {
        return res.json({
          result: true,
          message: "Session already connected",
          number: Ren.user.id
        });
      }
    }, 1500);
  } catch (e) {
    return res.status(500).json({
      result: false,
      message: "Internal Server Error.",
      error: e.message
    });
  }
});

// ✅ Jalankan server di port
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});