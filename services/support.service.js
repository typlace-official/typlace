const crypto = require("crypto");
const prisma = require("../lib/prisma");

let emitToUserSocketsFn = null;

function setSocket(_io, emitToUserSockets) {
  emitToUserSocketsFn =
    typeof emitToUserSockets === "function"
      ? emitToUserSockets
      : null;
}

function emitSupportEventToUser(email, event, payload) {
  if (!emitToUserSocketsFn) return;
  emitToUserSocketsFn(email, event, payload);
}

function toMs(value) {
  return value ? new Date(value).getTime() : null;
}

function ticketToLegacy(dbTicket) {
  if (!dbTicket) return null;

  return {
    id: dbTicket.id,
    shortId: dbTicket.shortId,
    kind: dbTicket.kind || "support",
    userEmail: dbTicket.userEmail,
    subject: dbTicket.subject,
    category: dbTicket.category,
    orderId: dbTicket.orderId || null,
    userId: dbTicket.userId || null,
    offerId: dbTicket.offerId || null,
    chatId: dbTicket.chatId || null,
    orderInternalId: dbTicket.orderInternalId || null,
    status: dbTicket.status || "waiting",
    priority: dbTicket.priority || "normal",
    reopenCount: Number(dbTicket.reopenCount || 0),
    assignedTo: dbTicket.assignedTo || null,
    assignedRole: dbTicket.assignedRole || null,
    assignedAt: toMs(dbTicket.assignedAt),
    resolutionAssignedAt: toMs(dbTicket.resolutionAssignedAt),
    createdAt: toMs(dbTicket.createdAt),
    updatedAt: toMs(dbTicket.updatedAt)
  };
}

function messageToLegacy(dbMessage) {
  if (!dbMessage) return null;

  return {
    id: dbMessage.id,
    ticketId: dbMessage.ticketId,
    from: dbMessage.from,
    userEmail: dbMessage.userEmail,
    username: dbMessage.username,
    avatarUrl: dbMessage.avatarUrl || null,
    avatarDataUrl: dbMessage.avatarDataUrl || null,
    text: dbMessage.text || "",
    attachments: Array.isArray(dbMessage.attachments) ? dbMessage.attachments : [],
    createdAt: toMs(dbMessage.createdAt)
  };
}

function logToLegacy(dbLog) {
  if (!dbLog) return null;

  return {
    id: dbLog.id,
    ticketId: dbLog.ticketId,
    action: dbLog.action,
    userEmail: dbLog.userEmail,
    username: dbLog.username,
    role: dbLog.role,
    createdAt: toMs(dbLog.createdAt)
  };
}

function isStaffUser(user) {
  return (
    user?.role === "support" ||
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.role === "resolution"
  );
}

async function makeShortId() {
  while (true) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();

    const exists = await prisma.supportTicket.findUnique({
      where: { shortId: id },
      select: { id: true }
    });

    if (!exists) return id;
  }
}

function normalizeTicketUpdateData(data = {}) {
  const next = { ...data };

  ["assignedAt", "resolutionAssignedAt", "createdAt", "updatedAt"].forEach((key) => {
    if (key in next) {
      next[key] = next[key] == null ? null : new Date(next[key]);
    }
  });

  if ("reopenCount" in next) {
    next.reopenCount = Number(next.reopenCount || 0);
  }

  return next;
}

async function createTicket({
  user,
  subject,
  category,
  orderId,
  userId,
  offerId,
  message,
  attachments,
  priority
}) {
  const ticketId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const logId = crypto.randomUUID();
  const shortId = await makeShortId();
  const nowDate = new Date();

  await prisma.$transaction([
    prisma.supportTicket.create({
      data: {
        id: ticketId,
        shortId,
        kind: "support",
        userEmail: user.email,
        subject,
        category,
        orderId: orderId || null,
        userId: userId || null,
        offerId: offerId || null,
        status: "waiting",
        priority: priority || "normal",
        reopenCount: 0,
        createdAt: nowDate,
        updatedAt: nowDate,
        assignedTo: null,
        assignedAt: null,
        assignedRole: null,
        resolutionAssignedAt: null,
        chatId: null,
        orderInternalId: null
      }
    }),
    prisma.supportMessage.create({
      data: {
        id: messageId,
        ticketId,
        from: "user",
        userEmail: user.email,
        username: user.username || "",
        avatarUrl: user.avatarUrl || null,
        avatarDataUrl: user.avatarDataUrl || null,
        text: String(message || ""),
        attachments: Array.isArray(attachments) ? attachments : [],
        createdAt: nowDate
      }
    }),
    prisma.supportLog.create({
      data: {
        id: logId,
        ticketId,
        action: "created",
        userEmail: user.email || "",
        username: user.username || "",
        role: user.role || "user",
        createdAt: nowDate
      }
    })
  ]);

  return getTicketById(ticketId);
}

async function getTicketsForUser(user) {
  let where = {};

  if (
    user.role === "support" ||
    user.role === "admin" ||
    user.role === "super_admin"
  ) {
    where = {};
  } else if (user.role === "resolution") {
    where = {
      kind: "order_dispute",
      assignedTo: user.email
    };
  } else {
    where = {
      userEmail: user.email
    };
  }

  const dbTickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { updatedAt: "desc" }
  });

  return dbTickets.map(ticketToLegacy);
}

async function getTicketById(id) {
  const dbTicket = await prisma.supportTicket.findUnique({
    where: { id }
  });

  return ticketToLegacy(dbTicket);
}

async function getMessages(ticketId) {
  const dbMessages = await prisma.supportMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" }
  });

  return dbMessages.map(messageToLegacy);
}

async function updateTicket(ticketId, data) {
  const dbTicket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: normalizeTicketUpdateData(data)
  });

  return ticketToLegacy(dbTicket);
}

async function addLog(ticketId, action, user) {
  const dbLog = await prisma.supportLog.create({
    data: {
      id: crypto.randomUUID(),
      ticketId,
      action,
      userEmail: user?.email || "",
      username: user?.username || "",
      role: user?.role || "system",
      createdAt: new Date()
    }
  });

  return logToLegacy(dbLog);
}

async function addMessage({ ticket, user, text, attachments }) {
  if (ticket.status === "resolved") {
    throw new Error("responses.support.ticketClosed");
  }

  const createdAt = new Date();
  const staff = isStaffUser(user);

  const ticketUpdate = {
    updatedAt: createdAt,
    status: staff
      ? "in_progress"
      : (ticket.assignedTo ? "in_progress" : "waiting")
  };

if (staff && !ticket.assignedTo) {
  ticketUpdate.assignedTo = user.email;
  ticketUpdate.assignedAt = createdAt;
  ticketUpdate.assignedRole = user.role || null;
}

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        from: staff ? "support" : "user",
        userEmail: user.email,
        username: user.username || "",
        avatarUrl: user.avatarUrl || null,
        avatarDataUrl: user.avatarDataUrl || null,
        text: String(text || ""),
        attachments: Array.isArray(attachments) ? attachments : [],
        createdAt
      }
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: normalizeTicketUpdateData(ticketUpdate)
    }),
    prisma.supportLog.create({
      data: {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        action: "message",
        userEmail: user.email || "",
        username: user.username || "",
        role: user.role || "user",
        createdAt
      }
    })
  ]);

  const updatedTicket = await getTicketById(ticket.id);

emitSupportEventToUser(updatedTicket.userEmail, "new-support-message", {
  ticketId: updatedTicket.id
});

if (updatedTicket.assignedTo) {
  emitSupportEventToUser(updatedTicket.assignedTo, "new-support-message", {
    ticketId: updatedTicket.id
  });
}

  return updatedTicket;
}

async function closeTicket(ticket, user) {
  const nowDate = new Date();

  await prisma.$transaction([
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "resolved",
        updatedAt: nowDate
      }
    }),
    prisma.supportLog.create({
      data: {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        action: "closed",
        userEmail: user?.email || "",
        username: user?.username || "",
        role: user?.role || "system",
        createdAt: nowDate
      }
    })
  ]);

  return getTicketById(ticket.id);
}

async function getLogs(ticketId) {
  const dbLogs = await prisma.supportLog.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" }
  });

  return dbLogs.map(logToLegacy);
}

async function getAllTickets() {
  const dbTickets = await prisma.supportTicket.findMany({
    orderBy: { updatedAt: "desc" }
  });

  return dbTickets.map(ticketToLegacy);
}

module.exports = {
  createTicket,
  getTicketsForUser,
  getTicketById,
  getMessages,
  updateTicket,
  addMessage,
  closeTicket,
  setSocket,
  getLogs,
  getAllTickets,
  addLog
};