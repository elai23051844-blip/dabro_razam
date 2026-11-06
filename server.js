'use strict';

/*
 * Двойное Рождество — сайт-приглашение + приём заявок в Telegram.
 *
 *   POST /api/lead    принять заявку { name, phone, message } и отправить её в Telegram
 *   GET  /api/health  проверка «сервер жив» (для хостингов)
 *   всё остальное     статические файлы сайта из папки public/
 *
 * Секреты (токен бота и chat_id) берутся ТОЛЬКО из переменных окружения / файла .env.
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const express = require('express');
const cors = require('cors');

/* ───────────────────────── Конфигурация ───────────────────────── */

function envStr(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function envNum(name, fallback) {
  const raw = envStr(name);
  const num = Number(raw);
  return raw !== '' && Number.isFinite(num) ? num : fallback;
}

function parseTrustProxy(value) {
  if (!value || value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // например: loopback или 10.0.0.0/8
}

const BOT_TOKEN = envStr('TELEGRAM_BOT_TOKEN');
const CHAT_ID = envStr('TELEGRAM_CHAT_ID');
const PORT = envNum('PORT', 3000);
const COOLDOWN_MS = Math.max(0, envNum('LEAD_COOLDOWN_SECONDS', 30)) * 1000;
const TELEGRAM_API_URL = envStr('TELEGRAM_API_URL', 'https://api.telegram.org').replace(/\/+$/, '');
const TELEGRAM_TIMEOUT_MS = 10 * 1000;
const TRUST_PROXY = parseTrustProxy(envStr('TRUST_PROXY'));
const ALLOWED_ORIGINS = envStr('ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const PUBLIC_DIR = path.join(__dirname, 'public');
// Переменные, которые выставляют популярные хостинги (Render, Railway, Fly.io, Heroku, Cloud Run).
const HOSTING_VAR = ['RENDER', 'RAILWAY_ENVIRONMENT', 'FLY_APP_NAME', 'DYNO', 'K_SERVICE'].find((name) => process.env[name]);

const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  phoneMinDigits: 10,
  phoneMaxDigits: 15,
  phoneMaxChars: 32,
  messageMax: 1500,
};

/* ───────────────────────── Логирование ───────────────────────── */

/** Любой текст для лога проходит через scrub(): токен бота в логи попасть не может. */
function scrub(value) {
  let text = value instanceof Error ? value.stack || value.message : String(value);
  if (BOT_TOKEN) text = text.split(BOT_TOKEN).join('<token>');
  return text;
}

const log = {
  info: (msg) => console.log(`${new Date().toISOString()} [info]  ${scrub(msg)}`),
  warn: (msg) => console.warn(`${new Date().toISOString()} [warn]  ${scrub(msg)}`),
  error: (msg) => console.error(`${new Date().toISOString()} [error] ${scrub(msg)}`),
};

if (!BOT_TOKEN || !CHAT_ID) {
  console.error(
    '[config] Не заданы TELEGRAM_BOT_TOKEN и/или TELEGRAM_CHAT_ID.\n' +
      '         Скопируйте .env.example в .env и впишите токен бота и chat_id (см. README.md).'
  );
  process.exit(1);
}

/* ───────────────────────── Валидация ───────────────────────── */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Строка → строка; пусто → ''; любой другой тип → null (ошибка типа). */
function asText(value) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : null;
}

function oneLine(text) {
  return text.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

function multiLine(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validateLead(body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const rawName = asText(src.name);
  const rawPhone = asText(src.phone);
  const rawMessage = asText(src.message);
  const fields = {};

  const name = rawName === null ? '' : oneLine(rawName);
  if (name.length < LIMITS.nameMin) {
    fields.name = `Укажите имя (не короче ${LIMITS.nameMin} символов).`;
  } else if (name.length > LIMITS.nameMax) {
    fields.name = `Имя слишком длинное (не больше ${LIMITS.nameMax} символов).`;
  } else if (!/\p{L}/u.test(name)) {
    fields.name = 'В имени должны быть буквы.';
  }

  const phone = rawPhone === null ? '' : oneLine(rawPhone);
  const digits = phone.replace(/\D/g, '');
  if (phone === '') {
    fields.phone = 'Укажите номер телефона.';
  } else if (!/^\+?[\d\s().-]+$/.test(phone) || phone.length > LIMITS.phoneMaxChars) {
    fields.phone = 'В телефоне допустимы только цифры, пробелы и знаки + - ( ).';
  } else if (digits.length < LIMITS.phoneMinDigits) {
    fields.phone = `В номере должно быть не меньше ${LIMITS.phoneMinDigits} цифр.`;
  } else if (digits.length > LIMITS.phoneMaxDigits) {
    fields.phone = `В номере должно быть не больше ${LIMITS.phoneMaxDigits} цифр.`;
  }

  const message = rawMessage === null ? '' : multiLine(rawMessage);
  if (rawMessage === null) {
    fields.message = 'Сообщение должно быть текстом.';
  } else if (message.length > LIMITS.messageMax) {
    fields.message = `Сообщение слишком длинное (не больше ${LIMITS.messageMax} символов).`;
  }

  const error = Object.values(fields)[0] || '';
  return { ok: error === '', error, fields, data: { name, phone, message } };
}

/* ───────────────────────── Сообщение для Telegram ───────────────────────── */

/** Для parse_mode=HTML Telegram требует экранировать только эти три символа. */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function minskTime(date) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Minsk',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch (err) {
    // Node без полных данных ICU: Минск — UTC+3 круглый год.
    return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  }
}

function buildTelegramText({ name, phone, message }, ip, date) {
  return [
    '🌟 <b>Новая заявка — Двойное Рождество</b>',
    '',
    `👤 <b>Имя:</b> ${escapeHtml(name)}`,
    `📞 <b>Телефон:</b> ${escapeHtml(phone)}`,
    '',
    message
      ? `💬 <b>Сообщение:</b>\n<blockquote>${escapeHtml(message)}</blockquote>`
      : '💬 <b>Сообщение:</b> <i>не указано</i>',
    '',
    `🕒 ${escapeHtml(minskTime(date))} (Минск)`,
    `🌐 IP: <code>${escapeHtml(ip)}</code>`,
  ].join('\n');
}

function telegramHint(status, description) {
  if (status === 401 || status === 404) return ' → проверьте TELEGRAM_BOT_TOKEN';
  if (/chat not found/i.test(description)) {
    return ' → проверьте TELEGRAM_CHAT_ID и нажмите Start у бота (или добавьте его в группу)';
  }
  if (status === 403) return ' → бот заблокирован или удалён из чата';
  return '';
}

async function sendToTelegram(text) {
  const url = `${TELEGRAM_API_URL}/bot${BOT_TOKEN}/sendMessage`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch (err) {
    const reason =
      err && err.name === 'TimeoutError'
        ? `нет ответа за ${TELEGRAM_TIMEOUT_MS / 1000} с`
        : (err && err.cause && err.cause.code) || (err && err.message) || 'ошибка сети';
    throw new Error(`Telegram недоступен: ${reason}`);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null; // ответ не в JSON — разберём ниже
  }

  if (!response.ok || !data || data.ok !== true) {
    const description = (data && data.description) || response.statusText || 'нет описания';
    throw new Error(`Telegram API ответил ${response.status}: ${description}${telegramHint(response.status, description)}`);
  }
  return data.result;
}

/* ───────────────────────── Защита от спама ───────────────────────── */

const lastLeadAt = new Map(); // ip → время последней принятой заявки

function clientIp(req) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  return ip.replace(/^::ffff:/i, '');
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, at] of lastLeadAt) {
    if (now - at >= COOLDOWN_MS) lastLeadAt.delete(ip);
  }
}, 60 * 1000).unref();

/* ───────────────────────── Приложение ───────────────────────── */

const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY !== false) app.set('trust proxy', TRUST_PROXY);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// CORS нужен, только если сайт открывается с другого адреса/порта, чем этот сервер.
if (ALLOWED_ORIGINS.length > 0) {
  app.use(
    '/api',
    cors({
      origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    })
  );
}

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/lead', express.json({ limit: '16kb' }), async (req, res) => {
  const ip = clientIp(req);
  try {
    if (!req.is('application/json')) {
      return res.status(415).json({ ok: false, error: 'Ожидается JSON (Content-Type: application/json).' });
    }

    // Ловушка для ботов: настоящий посетитель это скрытое поле не видит и не заполняет.
    const trap = req.body && req.body.website;
    if (typeof trap === 'string' && trap.trim() !== '') {
      log.warn(`Сработала ловушка для ботов, заявка отброшена (ip=${ip})`);
      return res.json({ ok: true });
    }

    const lead = validateLead(req.body);
    if (!lead.ok) {
      return res.status(400).json({ ok: false, error: lead.error, fields: lead.fields });
    }

    const now = Date.now();
    const waitMs = COOLDOWN_MS > 0 ? (lastLeadAt.get(ip) || 0) + COOLDOWN_MS - now : 0;
    if (waitMs > 0) {
      const wait = Math.ceil(waitMs / 1000);
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({
        ok: false,
        error: `Слишком много заявок подряд. Подождите ${wait} с и попробуйте снова.`,
        retryAfter: wait,
      });
    }
    if (COOLDOWN_MS > 0) lastLeadAt.set(ip, now); // занимаем место сразу — до await, чтобы двойной клик не прошёл

    try {
      await sendToTelegram(buildTelegramText(lead.data, ip, new Date(now)));
    } catch (err) {
      lastLeadAt.delete(ip); // сбой на нашей стороне — посетитель может попробовать ещё раз сразу
      log.error(`Заявка не доставлена в Telegram (ip=${ip}): ${err.message}`);
      return res.status(502).json({
        ok: false,
        error: 'Не удалось отправить заявку. Попробуйте ещё раз чуть позже.',
      });
    }

    log.info(`Заявка отправлена в Telegram (ip=${ip})`);
    return res.json({ ok: true });
  } catch (err) {
    log.error(`Непредвиденная ошибка в /api/lead (ip=${ip}): ${scrub(err)}`);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера. Попробуйте позже.' });
  }
});

app.all('/api/lead', (req, res) => {
  res.setHeader('Allow', 'POST, OPTIONS');
  res.status(405).json({ ok: false, error: 'Метод не поддерживается. Используйте POST.' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Не найдено.' });
});

app.use(
  express.static(PUBLIC_DIR, {
    setHeaders(res, filePath) {
      const heavy = /\.(woff2?|jpe?g|png|webp|svg|ico)$/i.test(filePath);
      res.setHeader('Cache-Control', heavy ? 'public, max-age=604800' : 'no-cache');
    },
  })
);

app.use((req, res) => {
  res.status(404).type('text/plain; charset=utf-8').send('404 — страница не найдена');
});

// Централизованная обработка ошибок: битый JSON, слишком большое тело, всё остальное.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Некорректный JSON в теле запроса.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Слишком большой запрос.' });
  }
  log.error(`Необработанная ошибка (${req.method} ${req.originalUrl}): ${scrub(err)}`);
  return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера. Попробуйте позже.' });
});

/* ───────────────────────── Запуск ───────────────────────── */

const server = http.createServer(app);

server.on('error', (err) => {
  log.error(err.code === 'EADDRINUSE' ? `Порт ${PORT} уже занят. Задайте другой в переменной PORT.` : err);
  process.exit(1);
});

server.listen(PORT, () => {
  log.info(`Сервер запущен: http://localhost:${PORT}`);
  log.info(
    `Лимит: ${COOLDOWN_MS > 0 ? `1 заявка с одного IP в ${COOLDOWN_MS / 1000} с` : 'выключен'}; ` +
      `CORS: ${ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.join(', ') : 'выключен (сайт и сервер на одном адресе)'}`
  );
  if (HOSTING_VAR && TRUST_PROXY === false) {
    log.warn(
      `Похоже, сервер работает на хостинге (${HOSTING_VAR}). Если перед ним стоит прокси, задайте TRUST_PROXY=1 — ` +
        'иначе у всех посетителей будет один IP и общий лимит заявок.'
    );
  }
});

function shutdown(signal) {
  log.info(`${signal}: останавливаю сервер…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => log.error(`unhandledRejection: ${scrub(reason)}`));
process.on('uncaughtException', (err) => {
  log.error(`uncaughtException: ${scrub(err)}`);
  process.exit(1);
});
