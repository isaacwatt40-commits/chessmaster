"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeftRight,
  Crown,
  Flame,
  LogOut,
  RotateCcw,
  Trophy,
} from "lucide-react";

type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Expert";
type GameMode = "ai" | "local";
type Orientation = "white" | "black";
type PromotionChoice = "q" | "r" | "b" | "n";

type Profile = {
  name: string;
  email: string;
  rating: number;
  stats: { total: number; wins: number; losses: number; draws: number };
  history: Array<{ result: string; opponent: string; time: string; pgn: string }>;
};

type PromotionState = { from: Square; to: Square; color: "w" | "b" };
type DailyChallenge = {
  title: string;
  description: string;
  fen: string;
};
type OpeningLesson = {
  title: string;
  summary: string;
  move: string;
};

const STORAGE_KEY = "chessmaster-profile";
const LEADERBOARD_KEY = "chessmaster-profiles";
const DAILY_CHALLENGES: DailyChallenge[] = [
  {
    title: "Opening Pattern",
    description: "Find the strongest central push with White to move.",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  },
  {
    title: "Fork Alert",
    description: "Spot the tactical fork that wins material.",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
  },
  {
    title: "King Safety",
    description: "Defend the king and build a winning attack.",
    fen: "r1bqkb1r/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
  },
];
const OPENING_LESSONS: OpeningLesson[] = [
  { title: "Italian Game", summary: "Develop knights and bishops quickly while controlling the center.", move: "1. e4 e5 2. Nf3 Nc6 3. Bc4" },
  { title: "Sicilian Defense", summary: "Counterattack the center and create asymmetry from move one.", move: "1. e4 c5 2. Nf3 d6" },
  { title: "Queen's Gambit", summary: "Challenge central control and prepare a strategic setup.", move: "1. d4 d5 2. c4" },
];

const pieceValues: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const centerBiasMatrix = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 2, 2, 2, 2, 0, 0],
  [0, 0, 2, 3, 3, 2, 0, 0],
  [0, 0, 2, 3, 3, 2, 0, 0],
  [0, 0, 2, 2, 2, 2, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

function getSavedProfiles(): Profile[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LEADERBOARD_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: Profile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(profiles));
}

function mergeProfile(profile: Profile) {
  const existing = getSavedProfiles();
  const merged = [...existing.filter((entry) => entry.email !== profile.email), profile];
  saveProfiles(merged);
}

function loadStoredProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function saveStoredProfile(profile: Profile | null) {
  if (typeof window === "undefined") return;
  if (!profile) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function createEmptyProfile(name: string, email: string): Profile {
  return {
    name,
    email,
    rating: 1200,
    stats: { total: 0, wins: 0, losses: 0, draws: 0 },
    history: [],
  };
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function evaluateBoard(game: Chess) {
  const board = game.board();
  let score = 0;

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;

      const value = pieceValues[piece.type] || 0;
      const isWhite = piece.color === "w";
      score += (isWhite ? 1 : -1) * value;
      score += (isWhite ? 1 : -1) * (centerBiasMatrix[row][col] || 0) * 6;

      if (piece.type === "p") {
        score += isWhite ? (7 - row) * 4 : (row - 1) * 4;
      }
    }
  }

  return score;
}

function getAiMove(game: Chess, difficulty: Difficulty) {
  const legalMoves = game.moves({ verbose: true }) as Array<{ from: Square; to: Square; promotion?: PromotionChoice }>;
  if (!legalMoves.length) return null;

  const depthMap: Record<Difficulty, number> = {
    Beginner: 1,
    Intermediate: 2,
    Advanced: 3,
    Expert: 3,
  };

  const depth = depthMap[difficulty] ?? 2;

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;

  const minimax = (position: Chess, ply: number, alpha: number, beta: number, maximizing: boolean): number => {
    if (ply === 0 || position.isGameOver()) {
      return evaluateBoard(position) * (position.turn() === "w" ? 1 : -1);
    }

    const nextMoves = position.moves({ verbose: true }) as Array<{ from: Square; to: Square; promotion?: PromotionChoice }>;
    if (!nextMoves.length) {
      if (position.isCheck()) {
        return maximizing ? -100000 + ply : 100000 - ply;
      }
      return 0;
    }

    if (maximizing) {
      let value = -Infinity;
      for (const move of nextMoves) {
        const branch = new Chess(position.fen());
        branch.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
        value = Math.max(value, minimax(branch, ply - 1, alpha, beta, false));
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return value;
    }

    let value = Infinity;
    for (const move of nextMoves) {
      const branch = new Chess(position.fen());
      branch.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      value = Math.min(value, minimax(branch, ply - 1, alpha, beta, true));
      beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return value;
  };

  for (const move of legalMoves) {
    if (difficulty === "Beginner" && Math.random() < 0.35) {
      return move;
    }

    const branch = new Chess(game.fen());
    branch.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    const score = minimax(branch, depth - 1, -Infinity, Infinity, false);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return {
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion || "q",
  };
}

function getGameStatus(game: Chess) {
  if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isThreefoldRepetition()) return "Draw by repetition";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isCheck()) return `${game.turn() === "w" ? "White" : "Black"} is in check`;
  return "Game in progress";
}

export default function Home() {
  const [game, setGame] = useState(() => new Chess());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<Orientation>("white");
  const [mode, setMode] = useState<GameMode>("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("Intermediate");
  const [status, setStatus] = useState("White to move");
  const [promotionState, setPromotionState] = useState<PromotionState | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [profileForm, setProfileForm] = useState({ name: "", email: "", password: "" });
  const [moveHistory, setMoveHistory] = useState<Array<{ san: string; color: string }>>([]);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge>(DAILY_CHALLENGES[0]);
  const [openingLesson, setOpeningLesson] = useState<OpeningLesson>(OPENING_LESSONS[0]);
  const [practiceMode, setPracticeMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pgnPreview, setPgnPreview] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const storedProfile = loadStoredProfile();
    if (storedProfile) setProfile(storedProfile);
    setLeaderboard(getSavedProfiles().sort((a, b) => b.rating - a.rating));
  }, []);

  useEffect(() => {
    if (!profile) {
      setAuthOpen(true);
      return;
    }

    const profiles = getSavedProfiles();
    const merged = [...profiles.filter((entry) => entry.email !== profile.email), profile].sort((a, b) => b.rating - a.rating);
    const unique = merged.filter((entry, index, arr) => arr.findIndex((item) => item.email === entry.email) === index);
    setLeaderboard(unique);
    saveProfiles(unique);
  }, [profile]);

  useEffect(() => {
    const history = game.history({ verbose: true });
    setMoveHistory(
      history.map((move) => ({
        san: move.san,
        color: move.color,
      }))
    );
    setPgnPreview(game.pgn());
    setStatus(getGameStatus(game));
  }, [game]);

  useEffect(() => {
    if (!profile || gameOver) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setWhiteTime((current) => (game.turn() === "w" && !game.isGameOver() ? Math.max(current - 1, 0) : current));
      setBlackTime((current) => (game.turn() === "b" && !game.isGameOver() ? Math.max(current - 1, 0) : current));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [game, gameOver, profile]);

  useEffect(() => {
    if (whiteTime === 0 || blackTime === 0) {
      const winner = whiteTime === 0 ? "Black" : "White";
      setGameOver(`${winner} wins on time`);
      setStatus(`${winner} wins on time`);
    }
  }, [whiteTime, blackTime]);

  useEffect(() => {
    if (mode !== "ai" || game.turn() !== "b" || game.isGameOver()) return;

    const timer = setTimeout(() => {
      const aiMove = getAiMove(game, difficulty);
      if (!aiMove) return;
      const next = new Chess(game.fen());
      const capture = !!game.get(aiMove.to);
      next.move({ from: aiMove.from, to: aiMove.to, promotion: aiMove.promotion || "q" });
      playMoveSound(capture);
      setGame(next);
      setSelectedSquare(null);
      setLegalMoves([]);
      setStatus(getGameStatus(next));
    }, 400);

    return () => clearTimeout(timer);
  }, [game, difficulty, mode]);

  const currentColor = useMemo(() => (game.turn() === "w" ? "White" : "Black"), [game]);

  const playMoveSound = (didCapture: boolean) => {
    if (!soundEnabled || typeof window === "undefined") return;

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const audioContext = new AudioCtx();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = didCapture ? "square" : "triangle";
    oscillator.frequency.value = didCapture ? 240 : 180;
    gainNode.gain.value = 0.04;

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
    oscillator.onended = () => audioContext.close();
  };

  const resetBoard = () => {
    const nextGame = practiceMode ? new Chess(dailyChallenge.fen) : new Chess();
    setGame(nextGame);
    setSelectedSquare(null);
    setLegalMoves([]);
    setPromotionState(null);
    setStatus(practiceMode ? "Practice challenge ready" : "White to move");
    setGameOver(null);
    setWhiteTime(600);
    setBlackTime(600);
  };

  const loadDailyChallenge = (challenge: DailyChallenge) => {
    setDailyChallenge(challenge);
    setPracticeMode(true);
    setGame(new Chess(challenge.fen));
    setStatus("Practice challenge ready");
    setGameOver(null);
    setWhiteTime(600);
    setBlackTime(600);
  };

  const copyPgn = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(game.pgn());
      setStatus("PGN copied to clipboard");
    }
  };

  const saveMatchStats = (winner: string, result: string) => {
    if (!profile) return;

    const nextProfile: Profile = {
      ...profile,
      rating: Math.max(1000, profile.rating + (winner === profile.name ? 15 : -10)),
      stats: {
        total: profile.stats.total + 1,
        wins: profile.stats.wins + (winner === profile.name ? 1 : 0),
        losses: profile.stats.losses + (winner !== profile.name && result !== "draw" ? 1 : 0),
        draws: profile.stats.draws + (result === "draw" ? 1 : 0),
      },
      history: [
        { result, opponent: winner === profile.name ? "AI / Local Rival" : "Opponent", time: new Date().toLocaleDateString(), pgn: game.pgn() },
        ...profile.history,
      ].slice(0, 5),
    };

    setProfile(nextProfile);
    saveStoredProfile(nextProfile);
    mergeProfile(nextProfile);
  };

  const finalizeGame = (finalGame: Chess, finalResult: string) => {
    setGame(finalGame);
    setGameOver(finalResult);
    setStatus(finalResult);

    if (!profile) return;

    if (finalResult.includes("draw") || finalResult === "Draw by stalemate" || finalResult === "Draw by repetition" || finalResult === "Draw by insufficient material") {
      saveMatchStats("draw", "draw");
      return;
    }

    const winnerName = finalResult.includes("White") ? "White" : "Black";
    const didPlayerWin = winnerName === "White" && profile.name !== "Opponent";
    saveMatchStats(didPlayerWin ? profile.name : "Opponent", didPlayerWin ? "win" : "loss");
  };

  const performMove = (from: Square, to: Square, promotion: PromotionChoice = "q") => {
    const next = new Chess(game.fen());
    const move = next.move({ from, to, promotion });

    if (!move) return false;

    const captured = !!game.get(to);
    playMoveSound(captured);

    setGame(next);
    setSelectedSquare(null);
    setLegalMoves([]);

    if (next.isGameOver()) {
      const result = next.isCheckmate()
        ? `${next.turn() === "w" ? "Black" : "White"} wins by checkmate`
        : next.isStalemate()
          ? "Draw by stalemate"
          : next.isInsufficientMaterial()
            ? "Draw by insufficient material"
            : "Draw";
      finalizeGame(next, result);
      return true;
    }

    setStatus(getGameStatus(next));
    return true;
  };

  const handleSquareClick = (square: Square) => {
    if (gameOver || promotionState) return;

    const piece = game.get(square);
    const isCurrentTurnPiece = piece && piece.color === game.turn();

    if (selectedSquare && legalMoves.includes(square)) {
      const move = game.moves({ square: selectedSquare, verbose: true }).find((item) => item.to === square);
      if (move && move.piece === "p" && (square[1] === "8" || square[1] === "1")) {
        setPromotionState({ from: selectedSquare, to: square, color: move.color });
        return;
      }
      performMove(selectedSquare, square);
      return;
    }

    if (isCurrentTurnPiece) {
      const moves = game.moves({ square, verbose: true }) as Array<{ to: Square }>;
      setSelectedSquare(square);
      setLegalMoves(moves.map((move) => move.to));
      setStatus(`Selected ${square}`);
      return;
    }

    setSelectedSquare(null);
    setLegalMoves([]);
  };

  const handlePieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: Square; targetSquare: Square }) => {
    if (gameOver || promotionState) return false;

    const move = game.moves({ square: sourceSquare, verbose: true }).find((item) => item.to === targetSquare);
    if (!move) return false;

    if (move.piece === "p" && (targetSquare[1] === "8" || targetSquare[1] === "1")) {
      setPromotionState({ from: sourceSquare, to: targetSquare, color: move.color });
      return true;
    }

    return performMove(sourceSquare, targetSquare);
  };

  const handlePromotion = (choice: PromotionChoice) => {
    if (!promotionState) return;
    const didMove = performMove(promotionState.from, promotionState.to, choice);
    setPromotionState(null);
    if (!didMove) setStatus("Promotion move failed");
  };

  const stats = profile?.stats || { total: 0, wins: 0, losses: 0, draws: 0 };
  const winRate = stats.total ? Math.round((stats.wins / stats.total) * 100) : 0;
  const boardHighlights = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};

    if (selectedSquare) {
      styles[selectedSquare] = {
        background: "rgba(251, 191, 36, 0.35)",
        boxShadow: "inset 0 0 0 3px rgba(251, 191, 36, 0.85)",
      };
    }

    legalMoves.forEach((move) => {
      styles[move] = {
        background: "radial-gradient(circle, rgba(251, 191, 36, 0.8) 0 20%, transparent 20% 100%)",
      };
    });

    return styles;
  }, [legalMoves, selectedSquare]);

  return (
    <main className="min-h-screen bg-[#060d1b] text-white">
      {!profile && authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/30 bg-[#0e1728] p-6 shadow-2xl shadow-black/50">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-lg font-black text-slate-900">C</div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-300">ChessMaster</p>
                <h2 className="text-2xl font-bold">Player Access</h2>
              </div>
            </div>

            <div className="mb-4 flex gap-2 rounded-full border border-white/10 bg-slate-900/70 p-1">
              <button className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${authMode === "register" ? "bg-amber-400 text-slate-900" : "text-slate-300"}`} onClick={() => setAuthMode("register")}>Register</button>
              <button className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${authMode === "login" ? "bg-amber-400 text-slate-900" : "text-slate-300"}`} onClick={() => setAuthMode("login")}>Login</button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-slate-300">
                Name
                <input className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-white outline-none focus:border-amber-400" value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} placeholder="Your full name" />
              </label>
              <label className="block text-sm text-slate-300">
                Email
                <input className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-white outline-none focus:border-amber-400" type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} placeholder="you@example.com" />
              </label>
              <label className="block text-sm text-slate-300">
                Password
                <input className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-white outline-none focus:border-amber-400" type="password" value={profileForm.password} onChange={(event) => setProfileForm({ ...profileForm, password: event.target.value })} placeholder="••••••••" />
              </label>
            </div>

            <button
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-3 font-bold text-slate-900 shadow-lg shadow-amber-900/30"
              onClick={() => {
                const safeName = profileForm.name.trim();
                const safeEmail = profileForm.email.trim();
                if (!safeName || !safeEmail) return;

                const existing = getSavedProfiles().find((entry) => entry.email === safeEmail);
                const nextProfile = existing || createEmptyProfile(safeName, safeEmail);
                const finalProfile = { ...nextProfile, name: safeName, email: safeEmail };
                setProfile(finalProfile);
                saveStoredProfile(finalProfile);
                mergeProfile(finalProfile);
                setAuthOpen(false);
              }}
            >
              {authMode === "register" ? "Create account" : "Login"}
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <header className="mb-6 rounded-[28px] border border-white/10 bg-[#0d172a]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-lg font-black text-slate-900">C</div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.26em] text-amber-300">Premier Chess</p>
                <h1 className="text-2xl font-bold tracking-tight">ChessMaster</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-slate-900/80 p-1">
                <button className={`rounded-full px-3 py-2 text-sm font-medium ${mode === "ai" ? "bg-amber-400 text-slate-900" : "text-slate-300"}`} onClick={() => setMode("ai")}>Vs AI</button>
                <button className={`rounded-full px-3 py-2 text-sm font-medium ${mode === "local" ? "bg-amber-400 text-slate-900" : "text-slate-300"}`} onClick={() => setMode("local")}>Local</button>
              </div>

              <select className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 outline-none" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
                <option>Expert</option>
              </select>

              <button className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={() => setOrientation((current) => (current === "white" ? "black" : "white"))}>Flip Board</button>
              <button className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={() => setPracticeMode((current) => !current)}>{practiceMode ? "Exit Practice" : "Practice Mode"}</button>
              <button className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={() => setSoundEnabled((current) => !current)}>{soundEnabled ? "Sound On" : "Sound Off"}</button>

              {profile ? (
                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-slate-900">{profile.name.charAt(0).toUpperCase()}</div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">{profile.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Rating {profile.rating}</div>
                  </div>
                  <button className="text-slate-300 transition hover:text-white" onClick={() => { setProfile(null); saveStoredProfile(null); }}><LogOut size={16} /></button>
                </div>
              ) : (
                <button className="rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900" onClick={() => setAuthOpen(true)}>Sign in</button>
              )}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_420px]">
          <section className="rounded-[30px] border border-white/10 bg-[#0d172a]/90 p-4 shadow-2xl shadow-black/25">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Match status</p>
                <h2 className="text-lg font-semibold text-white">{status}</h2>
              </div>

              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200" onClick={resetBoard}><RotateCcw size={16} className="inline-block mr-1" /> Restart</button>
                <button className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200" onClick={() => { const snapshot = new Chess(game.fen()); const moveHistorySnapshot = snapshot.history({ verbose: true }); if (moveHistorySnapshot.length) { const previous = new Chess(); for (const move of moveHistorySnapshot.slice(0, -1)) { previous.move({ from: move.from, to: move.to, promotion: move.promotion || "q" }); } setGame(previous); } }}>Undo</button>
                <button className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100" onClick={copyPgn}>Export PGN</button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
              <div className="relative overflow-hidden rounded-[30px] border border-amber-400/10 bg-[#091627] p-2 shadow-inner shadow-black/20">
                {gameOver && (
                  <div className="absolute inset-x-4 top-4 z-10 rounded-2xl border border-amber-400/20 bg-slate-950/80 px-3 py-2 text-center text-sm font-semibold text-amber-200 backdrop-blur-sm">
                    {gameOver}
                  </div>
                )}
                <Chessboard
                  options={{
                    position: game.fen(),
                    allowDragging: !gameOver && (mode === "local" || game.turn() === "w"),
                    onPieceDrop: ({ sourceSquare, targetSquare }) =>
                      handlePieceDrop({
                        sourceSquare: sourceSquare as Square,
                        targetSquare: targetSquare as Square,
                      }),
                    onSquareClick: ({ square }) => handleSquareClick(square as Square),
                    boardOrientation: orientation,
                    darkSquareStyle: { backgroundColor: "#1f2c42" },
                    lightSquareStyle: { backgroundColor: "#e9cf8f" },
                    squareStyles: boardHighlights,
                    boardStyle: { borderRadius: "24px", overflow: "hidden" },
                    animationDurationInMs: 200,
                    showNotation: true,
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Timer</p>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2"><span className="font-medium text-white">White</span><span className="font-bold text-amber-300">{formatTime(whiteTime)}</span></div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2"><span className="font-medium text-white">Black</span><span className="font-bold text-amber-300">{formatTime(blackTime)}</span></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Control</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2"><span>Turn</span><span className="font-semibold text-white">{currentColor}</span></div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2"><span>Mode</span><span className="font-semibold text-white">{mode === "ai" ? "AI" : "Local"}</span></div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2"><span>Difficulty</span><span className="font-semibold text-white">{difficulty}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[26px] border border-white/10 bg-[#0d172a]/90 p-4">
                <div className="mb-2 flex items-center gap-2 text-amber-300"><Trophy size={18} /><span className="text-[10px] uppercase tracking-[0.22em]">Dashboard</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Games</p><p className="mt-2 text-2xl font-bold text-white">{stats.total}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Wins</p><p className="mt-2 text-2xl font-bold text-emerald-300">{stats.wins}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Losses</p><p className="mt-2 text-2xl font-bold text-rose-300">{stats.losses}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Draws</p><p className="mt-2 text-2xl font-bold text-sky-300">{stats.draws}</p></div>
                </div>
                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">Win rate: <span className="font-bold">{winRate}%</span></div>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-[#0d172a]/90 p-4">
                <div className="mb-3 flex items-center gap-2 text-amber-300"><Crown size={18} /><span className="text-[10px] uppercase tracking-[0.22em]">Ranking</span></div>
                <div className="space-y-2">
                  {leaderboard.slice(0, 4).map((entry, index) => (
                    <div key={`${entry.email}-${index}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2">
                      <div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-slate-900">#{index + 1}</span><span className="text-sm text-white">{entry.name}</span></div>
                      <span className="text-sm font-semibold text-amber-300">{entry.rating}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-[#0d172a]/90 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-300"><ArrowLeftRight size={18} /><span className="text-[10px] uppercase tracking-[0.22em]">Move history</span></div>
              <div className="space-y-2">
                {moveHistory.length ? moveHistory.map((move, index) => (
                  <div key={`${move.san}-${index}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-300">#{index + 1}</span>
                    <span className="font-medium text-white">{move.san}</span>
                    <span className="text-xs uppercase tracking-[0.18em] text-amber-200">{move.color === "w" ? "White" : "Black"}</span>
                  </div>
                )) : <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-3 text-sm text-slate-300">No moves yet.</div>}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-[#0d172a]/90 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-300"><ArrowLeftRight size={18} /><span className="text-[10px] uppercase tracking-[0.22em]">PGN notation</span></div>
              <textarea readOnly value={pgnPreview || "Start a game to generate PGN notation."} className="h-28 w-full rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-200 outline-none" />
            </div>

            <div className="rounded-[26px] border border-white/10 bg-[#0d172a]/90 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-300"><Flame size={18} /><span className="text-[10px] uppercase tracking-[0.22em]">Daily challenge</span></div>
              <div className="space-y-3 rounded-2xl border border-amber-400/20 bg-slate-900/70 p-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-200">{dailyChallenge.title}</p>
                  <p className="mt-2 text-sm text-slate-300">{dailyChallenge.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAILY_CHALLENGES.map((challenge) => (
                    <button key={challenge.title} onClick={() => loadDailyChallenge(challenge)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${dailyChallenge.title === challenge.title ? "bg-amber-400 text-slate-900" : "border border-white/10 bg-slate-800 text-slate-200"}`}>
                      {challenge.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-[#0d172a]/90 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-300"><Crown size={18} /><span className="text-[10px] uppercase tracking-[0.22em]">Opening lessons</span></div>
              <div className="space-y-2">
                {OPENING_LESSONS.map((lesson) => (
                  <button key={lesson.title} onClick={() => setOpeningLesson(lesson)} className={`w-full rounded-2xl border p-3 text-left ${openingLesson.title === lesson.title ? "border-amber-400/40 bg-amber-500/10" : "border-white/10 bg-slate-900/70"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{lesson.title}</p>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Study</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-300">{lesson.summary}</p>
                    <p className="mt-2 text-[11px] font-medium text-amber-200">{lesson.move}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-[#0d172a]/90 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-300"><Flame size={18} /><span className="text-[10px] uppercase tracking-[0.22em]">Recent matches</span></div>
              <div className="space-y-2">
                {(profile?.history || []).slice(0, 4).map((match, index) => (
                  <div key={`${match.time}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/70 p-3 text-sm">
                    <div className="flex items-center justify-between"><span className="font-medium text-white">{match.result}</span><span className="text-xs uppercase tracking-[0.16em] text-slate-400">{match.time}</span></div>
                    <p className="mt-1 text-slate-300">vs {match.opponent}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {promotionState && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="rounded-[28px] border border-white/10 bg-[#0d172a] p-5 shadow-2xl shadow-black/40">
            <p className="mb-3 text-center text-[10px] uppercase tracking-[0.22em] text-amber-300">Pawn promotion</p>
            <div className="grid grid-cols-2 gap-3">
              {(["q", "r", "b", "n"] as PromotionChoice[]).map((piece) => (
                <button key={piece} onClick={() => handlePromotion(piece)} className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:border-amber-400/60">{piece === "q" ? "Queen" : piece === "r" ? "Rook" : piece === "b" ? "Bishop" : "Knight"}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
