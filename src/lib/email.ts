import nodemailer from "nodemailer";
import type { Order, StoreSettings } from "./types";
import { formatCAD } from "./i18n";
import { formatPickupDate } from "./time";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass || pass.includes("your-16-char")) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user, pass },
  });
}

function buildItemsTableHtml(order: Order): string {
  const rows = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #ece6db;color:#181513;">${escapeHtml(i.nameEn)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #ece6db;text-align:center;color:#4d453e;">${i.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #ece6db;text-align:right;font-weight:600;color:#181513;">${formatCAD(i.priceCents * i.quantity)}</td>
      </tr>`
    )
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <thead>
        <tr style="background:#faf6ee;">
          <th style="padding:10px 12px;text-align:left;color:#6b5f54;font-size:12px;text-transform:uppercase;">Item</th>
          <th style="padding:10px 12px;text-align:center;color:#6b5f54;font-size:12px;text-transform:uppercase;">Qty</th>
          <th style="padding:10px 12px;text-align:right;color:#6b5f54;font-size:12px;text-transform:uppercase;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:12px;font-weight:700;color:#181513;">Total (CAD)</td>
          <td style="padding:12px;text-align:right;font-weight:800;font-size:16px;color:#b84318;">${formatCAD(order.totalCents)}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

export async function sendOrderEmails(
  order: Order,
  settings: StoreSettings,
  kind: "confirmed" | "manual_received"
): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email skipped — SMTP not configured] (${kind}) Order ${order.orderNumber}`);
    return { sent: false, reason: "SMTP not configured" };
  }

  const fromEmail = process.env.SMTP_USER!;
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || fromEmail;
  const pickupDateFormatted = formatPickupDate(order.pickupDate, "en");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    settings.pickupAddress
  )}`;
  const itemsHtml = buildItemsTableHtml(order);

  try {
    // 1. Customer email
    const isConfirmed = kind === "confirmed";
    const statusBox = isConfirmed
      ? `<div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:16px;margin:20px 0;">
           <strong style="color:#065f46;font-size:15px;">Order Confirmed &amp; Paid</strong>
           <p style="margin:6px 0 0;color:#047857;font-size:14px;">Your payment has been received. Your kebab will be grilled fresh for your pickup window!</p>
         </div>`
      : `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;margin:20px 0;">
           <strong style="color:#9a3412;font-size:15px;">e-Transfer Verification Pending</strong>
           <p style="margin:6px 0 0;color:#7c2d12;font-size:14px;">We received your order request and receipt. If you have not sent the Interac e-Transfer yet, please send <strong>${formatCAD(order.totalCents)}</strong> to <strong>${escapeHtml(settings.etransferEmail)}</strong>. You will receive a confirmation email once verified (within 3 hours).</p>
         </div>`;

    await transporter.sendMail({
      from: `"Weekend Backyard BBQ" <${fromEmail}>`,
      to: order.customerEmail,
      subject: isConfirmed
        ? `Order Confirmed (${order.orderNumber}) — Weekend BBQ`
        : `Order Request Received (${order.orderNumber}) — Weekend BBQ`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#181513;line-height:1.6;">
          <div style="background:#181513;color:#fdfbf7;padding:24px;border-radius:14px 14px 0 0;text-align:center;">
            <div style="color:#e4b24c;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Weekend Backyard BBQ</div>
            <h1 style="margin:8px 0 0;font-size:22px;">${isConfirmed ? "Your Order is Confirmed!" : "Order Request Received"}</h1>
            <div style="margin-top:8px;color:#d6cdc2;font-size:13px;">Order #${escapeHtml(order.orderNumber)}</div>
          </div>
          <div style="background:#ffffff;border:1px solid #ece6db;border-top:none;padding:24px;border-radius:0 0 14px 14px;">
            <p>Hi ${escapeHtml(order.customerName)},</p>
            ${statusBox}
            <div style="background:#faf6ee;border:1px solid #e7d9c1;border-radius:12px;padding:16px;margin:20px 0;">
              <div style="font-size:13px;color:#6b5f54;margin-bottom:4px;"><strong>Pickup Date:</strong> ${escapeHtml(pickupDateFormatted)}</div>
              <div style="font-size:13px;color:#6b5f54;margin-bottom:4px;"><strong>Pickup Time:</strong> ${escapeHtml(order.pickupTime)}</div>
              <div style="font-size:13px;color:#6b5f54;margin-bottom:12px;"><strong>Pickup Address:</strong> ${escapeHtml(settings.pickupAddress)}</div>
              <a href="${mapsUrl}" style="display:inline-block;background:#b84318;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:13px;">Get Directions</a>
            </div>
            ${itemsHtml}
            <p style="font-size:13px;color:#6b5f54;margin-top:24px;">Questions? Reply to this email or call ${escapeHtml(settings.pickupPhone)}.</p>
          </div>
        </div>
      `,
    });

    // 2. Owner alert email
    if (settings.emailAlertsEnabled && ownerEmail) {
      await transporter.sendMail({
        from: `"Weekend BBQ Orders" <${fromEmail}>`,
        to: ownerEmail,
        replyTo: `${order.customerName} <${order.customerEmail}>`,
        subject: `[${order.paymentMethod.toUpperCase()} · ${order.status}] New Order ${order.orderNumber} — ${order.customerName} (${formatCAD(order.totalCents)})`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#181513;">
            <h2>New Order #${escapeHtml(order.orderNumber)}</h2>
            <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}<br/>
               <strong>Email:</strong> ${escapeHtml(order.customerEmail)}<br/>
               <strong>Phone:</strong> ${escapeHtml(order.customerPhone)}<br/>
               <strong>Pickup:</strong> ${escapeHtml(pickupDateFormatted)} at ${escapeHtml(order.pickupTime)}<br/>
               <strong>Payment:</strong> ${escapeHtml(order.paymentMethod)} (${escapeHtml(order.paymentStatus)})</p>
            ${order.notes ? `<p><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>` : ""}
            ${itemsHtml}
          </div>
        `,
      });
    }

    return { sent: true };
  } catch (err) {
    console.error("Failed to send order emails:", err);
    return { sent: false, reason: err instanceof Error ? err.message : "SMTP error" };
  }
}
