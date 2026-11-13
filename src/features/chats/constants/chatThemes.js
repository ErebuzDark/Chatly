export const CHAT_THEMES = {
  classic: {
    id: 'classic',
    name: 'Classic Blue',
    primaryColor: '#0a84ff',
    bubbleStyle: {
      background: 'linear-gradient(135deg, #0a84ff 0%, #0066cc 100%)',
      color: '#ffffff',
    },
    accentTint: 'rgba(10, 132, 255, 0.14)',
    quickEmoji: '👍',
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Rose',
    primaryColor: '#f43f5e',
    bubbleStyle: {
      background: 'linear-gradient(135deg, #ff512f 0%, #dd2476 100%)',
      color: '#ffffff',
    },
    accentTint: 'rgba(244, 63, 94, 0.14)',
    quickEmoji: '❤️',
  },
  purple: {
    id: 'purple',
    name: 'Cyberpunk Violet',
    primaryColor: '#8b5cf6',
    bubbleStyle: {
      background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
      color: '#ffffff',
    },
    accentTint: 'rgba(139, 92, 246, 0.14)',
    quickEmoji: '🔥',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Mint',
    primaryColor: '#10b981',
    bubbleStyle: {
      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      color: '#ffffff',
    },
    accentTint: 'rgba(16, 185, 129, 0.14)',
    quickEmoji: '🙌',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Lagoon',
    primaryColor: '#06b6d4',
    bubbleStyle: {
      background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
      color: '#ffffff',
    },
    accentTint: 'rgba(6, 182, 212, 0.14)',
    quickEmoji: '🌊',
  },
  gold: {
    id: 'gold',
    name: 'Midnight Amber',
    primaryColor: '#f59e0b',
    bubbleStyle: {
      background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
      color: '#ffffff',
    },
    accentTint: 'rgba(245, 158, 11, 0.14)',
    quickEmoji: '✨',
  },
  berry: {
    id: 'berry',
    name: 'Neon Berry',
    primaryColor: '#ec4899',
    bubbleStyle: {
      background: 'linear-gradient(135deg, #ec4899 0%, #6366f1 100%)',
      color: '#ffffff',
    },
    accentTint: 'rgba(236, 72, 153, 0.14)',
    quickEmoji: '💖',
  },
}

export const QUICK_EMOJI_OPTIONS = ['👍', '❤️', '🔥', '😂', '😮', '🎉', '🙌', '💯', '🚀', '✨']

export function getChatTheme(chat) {
  const themeId = chat?.themeId || 'classic'
  return CHAT_THEMES[themeId] || CHAT_THEMES.classic
}

export function getChatQuickEmoji(chat) {
  if (chat?.quickEmoji) return chat.quickEmoji
  const theme = getChatTheme(chat)
  return theme.quickEmoji || '👍'
}

export const STORY_BACKGROUNDS = [
  {
    id: 'aurora',
    label: 'Aurora',
    css: 'linear-gradient(135deg, #0a84ff 0%, #8b5cf6 50%, #ec4899 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    css: 'linear-gradient(135deg, #ff512f 0%, #dd2476 100%)',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    css: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #06b6d4 100%)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    css: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #581c87 100%)',
  },
  {
    id: 'amber',
    label: 'Amber',
    css: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  },
]

// High-reliability animated Stickers (Google Noto Animated Emoji WebP/GIF)
export const STICKER_PACK = [
  { id: 'joy', label: 'Laughing', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.gif' },
  { id: 'heart-eyes', label: 'Love', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/512.gif' },
  { id: 'fire', label: 'Fire', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif' },
  { id: 'party', label: 'Party', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f973/512.gif' },
  { id: 'thumbs-up', label: 'Thumbs Up', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/512.gif' },
  { id: 'red-heart', label: 'Heart', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.gif' },
  { id: 'mind-blown', label: 'Mind Blown', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92f/512.gif' },
  { id: 'sob', label: 'Crying', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f62d/512.gif' },
  { id: 'sunglasses', label: 'Cool', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60e/512.gif' },
  { id: 'clap', label: 'Clapping', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44f/512.gif' },
  { id: 'rocket', label: 'Rocket', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f680/512.gif' },
  { id: '100', label: '100', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4af/512.gif' },
  { id: 'eyes', label: 'Eyes', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f440/512.gif' },
  { id: 'wave', label: 'Wave', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44b/512.gif' },
  { id: 'thinking', label: 'Thinking', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f914/512.gif' },
  { id: 'star-struck', label: 'Star Struck', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f929/512.gif' },
]

// Curated default GIFs + public Tenor v1 search support
export const CURATED_GIFS = [
  { id: 'g1', title: 'High Five', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
  { id: 'g2', title: 'Thumbs Up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { id: 'g3', title: 'Celebrate', url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif' },
  { id: 'g4', title: 'Laughter', url: 'https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif' },
  { id: 'g5', title: 'Mind Blown', url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' },
  { id: 'g6', title: 'Applause', url: 'https://media.giphy.com/media/7rj2ZgttvgomY/giphy.gif' },
  { id: 'g7', title: 'Dancing', url: 'https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif' },
  { id: 'g8', title: 'Wave Hello', url: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif' },
]

