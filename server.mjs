import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


dotenv.config();
if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing in environment variables");
}

const app = express();
const PORT = process.env.PORT || 5000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());
app.get("/", (req, res) => {
  res.send("Backend working ✅");
});

// Database connect (SAFE for Railway / Docker)
// ===== SQLITE SAFE PATH (ESM + WINDOWS) =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, "db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "users.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("DB Error:", err);
  } else {
    console.log("✅ SQLite Database Connected");
  }
});


db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`);

//sign up
app.post("/signup", async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    email = email.toLowerCase().trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const passwordRegex =
      /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain 1 uppercase, 1 number, 1 special character & min 8 chars",
      });
    }

    db.get(
      "SELECT id FROM users WHERE email = ?",
      [email],
      async (err, row) => {
        if (err) {
          console.error(err);
          return res.status(500).json({
            success: false,
            message: "Server error",
          });
        }

        if (row) {
          return res.status(409).json({
            success: false,
            message: "Email already registered",
          });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
          "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
          [username, email, hashedPassword],
          () => {
            return res.json({
              success: true,
              message: "Signup successful",
            });
          }
        );
      }
    );
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

//login
app.post("/login", async (req, res) => {
  let { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password required",
    });
  }

  email = email.toLowerCase().trim();

  db.get(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, user) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({
          success: false,
          message: "Server error",
        });
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid Email or Password",
        });
      }

      try {
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
          return res.status(401).json({
            success: false,
            message: "Invalid Email or Password",
          });
        }

        res.json({
          success: true,
          message: "Login successful",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
          },
        });
      } catch (err) {
        console.error("Bcrypt Error:", err);
        return res.status(500).json({
          success: false,
          message: "Server error",
        });
      }
    }
  );
});

// ======================= CHAT API (GROQ) =======================
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ reply: "Message missing ❌" });
  }

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content:
              "User jis language me baat kare, reply usi language me do. Hindi me bole to Hindi me jawab do."
          },
          {
            role: "user",
            content: message
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply =
      response.data?.choices?.[0]?.message?.content ||
      "AI se response nahi mila 😢";

    res.json({ reply });
  } catch (error) {
    console.error("Groq API Error:", error.response?.data || error.message);
    res.status(500).json({
      reply: "Server error, AI response nahi aaya ❌"
    });
  }
});


// ======================= IMAGE API (FREE POLLINATIONS) =======================
app.post("/generate-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    console.log("IMAGE PROMPT:", prompt);

    // Puter.js public API endpoint (no API key needed)
    const response = await axios.post(
      "https://api.puter.com/v2/image/generate",
      {
        prompt: prompt,
        width: 512,
        height: 512,
        samples: 1,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log("PUTER RESPONSE:", response.data);

    // The response usually has the image URL in response.data.output[0].url
    const imageUrl = response.data.output?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: "Image URL not found" });
    }

    console.log("FINAL IMAGE URL:", imageUrl);
    return res.json({ imageUrl });
  } catch (err) {
    console.error("Puter.js Error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Puter.js image generation failed" });
  }
});
/// NEVER LIE
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// ======================= SERVER START =======================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});



//VXSJBXKJBLISJLOJ;CHA