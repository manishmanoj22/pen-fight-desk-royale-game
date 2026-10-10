# Pen Fight: Desk Royale

A school-desk pen-flicking game built with Expo (React Native). Play against the
AI, pass-and-play with a friend on one device, or play online.

- `frontend/` – the Expo app (iOS, Android and web)
- `backend/` – the game server for online matches (FastAPI + Socket.IO)

## Play against the AI or pass-and-play

```bash
cd frontend
npm install
npx expo start --web     # or scan the QR code with Expo Go on your phone
```

## Play online on your own computer or Wi-Fi

Online matches need the game server running. Use two terminals.

**Terminal 1 – the game server**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python server.py                # serves on port 8000
```

**Terminal 2 – the app**

```bash
cd frontend
npx expo start --web
```

Then open the game in two browser windows (or a browser and a phone), choose
**Online Match**, press **Host a Game** in one, and enter the 6-character code
in the other.

The app finds the server automatically: in a browser it uses the same address
the page was opened from, and in Expo Go it uses your computer's address, both
on port 8000. A phone must be on the same Wi-Fi as the computer, and the
computer's firewall must allow incoming connections on port 8000.

MongoDB is optional; the server runs without `MONGO_URL` and keeps game rooms
in memory.

## Put the server online (play from anywhere)

1. Deploy the `backend` folder to any host that runs Python, such as Railway or
   Render. Start command: `python server.py` (it uses the host's `PORT`).
2. Point the app at it by creating `frontend/.env` with:

   ```
   EXPO_PUBLIC_SERVER_URL=https://your-server.example.com
   ```

3. Restart Expo (`npx expo start --clear`) so it picks up the setting. For app
   store builds with EAS, set the same variable in your EAS environment.

The server must be served over `https` when the web version of the game is
served over `https`, or browsers will block the connection.

## How online matches stay fair

Both devices run the same physics on the same fixed-size desk, with a fixed
physics timestep, so a shot plays out the same on each. After every shot, the
player who took it sends where both pens stopped and the other device matches
it, so small differences can never build up over a match.
