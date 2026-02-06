import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send("Backend working ✅");
});
// Database connect
const db = new sqlite3.Database("./users.db", (err) => {
  if (err) console.log("DB Error:", err);
  else console.log("✅ SQLite Database Connected");
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
// ======================= SIGN UP =======================
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  // 1️⃣ Empty check
  if (!username || !email || !password) {
    return res.json({ success: false, message: "All fields required" });
  }

  // 2️⃣ Email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.json({ success: false, message: "Invalid email format" });
  }

  try {
    // 3️⃣ Check email already exists in DB
    db.get(
      `SELECT id FROM users WHERE email = ?`,
      [email],
      async (err, row) => {
        if (err) {
          console.error("DB Error:", err);
          return res.json({ success: false, message: "Server error" });
        }

        if (row) {
          return res.json({
            success: false,
            message: "Email already registered",
          });
        }

        // 4️⃣ Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 5️⃣ Insert user
        db.run(
          `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
          [username, email.toLowerCase(), hashedPassword],
          function (err) {
            if (err) {
              console.error("Insert Error:", err);
              return res.json({ success: false, message: "Signup failed" });
            }

            res.json({
              success: true,
              message: "Signup successful",
            });
          },
        );
      },
    );
  } catch (err) {
    console.error("Signup Error:", err);
    res.json({ success: false, message: "Server error" });
  }
});

// login
// ======================= LOGIN ENDPOINT =======================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, message: "Email and password required" });
  }

  // DB se user fetch
  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) {
      console.error("DB Error:", err);
      return res.json({ success: false, message: "Server error" });
    }

    if (!user) {
      return res.json({ success: false, message: "Invalid Email or Password" });
    }

    try {
      // Password match check
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.json({
          success: false,
          message: "Invalid Email or Password",
        });
      }

      // Login success
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
      console.error("Bcrypt Compare Error:", err);
      return res.json({ success: false, message: "Server error" });
    }
  });
});

// ======================= CHAT API (GROQ) =======================
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) return res.status(400).json({ reply: "Message missing ❌" });

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: message }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    res.json({
      reply: response.data.choices[0].message.content,
    });
  } catch (error) {
    console.log("Groq API Error:", error.response?.data || error.message);
    res.status(500).json({ reply: "AI response nahi mila ❌" });
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
// ======================= SERVER START =======================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
