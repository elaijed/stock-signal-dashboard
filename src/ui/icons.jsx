// One icon set for the whole app (Lucide, 1.75 stroke). Use <Ic name="home" /> instead of emoji.
import {
  Home, LineChart, Compass, Users, Search, Bell, Briefcase, Eye, Gamepad2, User, Moon, Sun, Settings,
  BookOpen, Lightbulb, MapPin, GraduationCap, Calendar, Flag, Trophy, Target, Flame, MessageCircle,
  PenLine, BarChart3, Link2, Megaphone, Lock, Globe, Mail, TrendingUp, TrendingDown, AlertTriangle,
  Check, X, Sprout, Coins, Brain, Handshake, ShieldAlert, Plus, HelpCircle, LogOut, CircleDot,
  Heart, Bookmark, Share2, Send, Image, MoreHorizontal, Gift, Star, Crown, Zap, Phone, ArrowRight,
  ArrowUp, ArrowDown, Copy, Sparkles, Rocket, Shield, KeyRound, Grid3x3, UserPlus, UserCheck,
  ChevronRight, ChevronLeft, Menu, Award, Medal, Play, Clock, Trash2, Camera, Hash, Repeat2, Smile,
} from "lucide-react";

const MAP = {
  home: Home, chart: LineChart, compass: Compass, users: Users, search: Search, bell: Bell,
  briefcase: Briefcase, eye: Eye, game: Gamepad2, user: User, moon: Moon, sun: Sun, settings: Settings,
  book: BookOpen, bulb: Lightbulb, pin: MapPin, cap: GraduationCap, calendar: Calendar, flag: Flag,
  trophy: Trophy, target: Target, flame: Flame, chat: MessageCircle, pen: PenLine, poll: BarChart3,
  link: Link2, megaphone: Megaphone, lock: Lock, globe: Globe, mail: Mail, up: TrendingUp,
  down: TrendingDown, warn: AlertTriangle, check: Check, x: X, sprout: Sprout, coins: Coins,
  brain: Brain, handshake: Handshake, stop: ShieldAlert, plus: Plus, help: HelpCircle, logout: LogOut,
  dot: CircleDot,
  heart: Heart, bookmark: Bookmark, share: Share2, send: Send, image: Image, more: MoreHorizontal,
  gift: Gift, star: Star, crown: Crown, zap: Zap, phone: Phone, arrowRight: ArrowRight, arrowUp: ArrowUp,
  arrowDown: ArrowDown, copy: Copy, sparkles: Sparkles, rocket: Rocket, shield: Shield, key: KeyRound,
  grid: Grid3x3, userPlus: UserPlus, userCheck: UserCheck, chevronRight: ChevronRight, chevronLeft: ChevronLeft,
  menu: Menu, award: Award, medal: Medal, play: Play, clock: Clock, trash: Trash2, camera: Camera,
  hash: Hash, repost: Repeat2, smile: Smile,
};

export function Ic({ name, size = 16, className = "", fill }) {
  const C = MAP[name] || CircleDot;
  return <C size={size} strokeWidth={1.75} fill={fill || "none"} className={`inline-block shrink-0 align-[-0.15em] ${className}`} aria-hidden="true" />;
}

// Icons used as data (signal rows, digest items, badges) are stored as names; this renders them.
const TONE = { good: "text-emerald-500", bad: "text-red-500", warn: "text-amber-500" };
export function IconToken({ name, size = 16 }) {
  if (name === "good") return <Ic name="check" size={size} className={TONE.good} />;
  if (name === "bad") return <Ic name="x" size={size} className={TONE.bad} />;
  if (name === "caution") return <Ic name="warn" size={size} className={TONE.warn} />;
  if (MAP[name]) return <Ic name={name} size={size} />;
  return <span>{name}</span>;
}
