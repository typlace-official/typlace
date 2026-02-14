// services/support.service.js

const crypto = require("crypto");
let ioInstance = null;
let onlineSocketsMap = null;

function setSocket(io, onlineSockets){
  ioInstance = io;
  onlineSocketsMap = onlineSockets;
}

// временное хранилище (потом заменим на Mongo)
const supportTickets = [];
const supportMessages = [];
const supportLogs = [];

const lastTicketCreateTime = new Map(); // 👈 ДОБАВИЛИ

function makeShortId(){
  let id;
  let exists = true;

  while(exists){
    id = Math.floor(100000 + Math.random() * 900000).toString();
    exists = supportTickets.some(t => t.shortId === id);
  }

  return id;
}

function createTicket({ user, subject, category, orderId, message, attachments, priority }){

  // 🔒 Проверка темы
  if (!subject || subject.length < 3) {
    throw new Error("Тема слишком короткая");
  }

  // ⛔ анти-флуд создания тикетов (1 тикет в 60 сек)
  const lastTime = lastTicketCreateTime.get(user.email);

if (lastTime && Date.now() - lastTime < 60_000) {
  throw new Error("Подождите минуту перед созданием нового тикета");
}

lastTicketCreateTime.set(user.email, Date.now());

  const ticketId = crypto.randomUUID();
  const createdAt = Date.now();

const ticket = {
  id: ticketId,
  shortId: makeShortId(),
  userEmail: user.email,
  subject,
  category,
  orderId: orderId || null,
  status: "waiting",
  priority: priority || "normal",
  reopenCount: 0,
  createdAt,
  updatedAt: createdAt,
  assignedTo: null,
  assignedAt: null
};

  supportTickets.push(ticket);

  supportMessages.push({
    id: crypto.randomUUID(),
    ticketId,
    from: "user",
    userEmail: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
    avatarDataUrl: user.avatarDataUrl || null,
    text: message,
    attachments: attachments || [],
    createdAt
  });
addLog(ticketId, "created", user);

  return ticket;
}

function getTicketsForUser(user){

  if(user.role === "support" || user.role === "admin"){
    return [...supportTickets]
      .sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));
  }

  return supportTickets
    .filter(t=>t.userEmail === user.email)
    .sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));
}

function getTicketById(id){
  return supportTickets.find(t=>t.id === id);
}

function getMessages(ticketId){
  return supportMessages
    .filter(m=>m.ticketId === ticketId)
    .sort((a,b)=>a.createdAt - b.createdAt);
}

function addMessage({ ticket, user, text, attachments }){

  if(ticket.status === "resolved"){
    throw new Error("Тикет закрыт");
  }

  const createdAt = Date.now();
// анти-спам (1 сообщение в 2 секунды)
const lastMsg = [...supportMessages]
  .reverse()
  .find(m => 
    m.ticketId === ticket.id && 
    m.userEmail === user.email
  );

if (lastMsg && Date.now() - lastMsg.createdAt < 2000) {
  throw new Error("Слишком быстро. Подождите пару секунд.");
}

supportMessages.push({
  id: crypto.randomUUID(),
  ticketId: ticket.id,
  from:
    user.role === "support" || user.role === "admin"
      ? "support"
      : "user",
  userEmail: user.email,
  username: user.username,
  avatarUrl: user.avatarUrl || null,
  avatarDataUrl: user.avatarDataUrl || null,
  text,
  attachments: attachments || [],
  createdAt
});
addLog(ticket.id, "message", user);
if (user.role === "support" || user.role === "admin") {

  // если ещё не назначен — автоматически назначаем
  if (!ticket.assignedTo) {
    ticket.assignedTo = user.email;
    ticket.assignedAt = Date.now();
  }

  ticket.status = "in_progress";

} else {

  // пользователь написал
  if (ticket.assignedTo) {
    ticket.status = "in_progress";
  } else {
    ticket.status = "waiting";
  }

}

// 🔥 REALTIME отправка сообщения
if(ioInstance && onlineSocketsMap){

  // отправляем владельцу тикета
  const userSocket = onlineSocketsMap.get(ticket.userEmail);
  if(userSocket){
    ioInstance.to(userSocket).emit("new-support-message", {
      ticketId: ticket.id
    });
  }

  // отправляем назначенному сотруднику
  if(ticket.assignedTo){
    const supportSocket = onlineSocketsMap.get(ticket.assignedTo);
    if(supportSocket){
      ioInstance.to(supportSocket).emit("new-support-message", {
        ticketId: ticket.id
      });
    }
  }
}

  ticket.updatedAt = createdAt;
}

function closeTicket(ticket, user){
  ticket.status = "resolved";
  ticket.updatedAt = Date.now();
  addLog(ticket.id, "closed", user);
}
function addLog(ticketId, action, user){
  supportLogs.push({
    id: crypto.randomUUID(),
    ticketId,
    action,
    userEmail: user.email,
    username: user.username,
    role: user.role,
    createdAt: Date.now()
  });
}
function getLogs(ticketId){
  return supportLogs
    .filter(l => l.ticketId === ticketId)
    .sort((a,b)=>a.createdAt - b.createdAt);
}
function getAllTickets(){
  return supportTickets;
}

module.exports = {
  createTicket,
  getTicketsForUser,
  getTicketById,
  getMessages,
  addMessage,
  closeTicket,
  setSocket,
  getLogs,
  getAllTickets,
  addLog
};