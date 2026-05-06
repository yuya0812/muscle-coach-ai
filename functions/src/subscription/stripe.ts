import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const db = admin.firestore;

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(secretKey);
}

export const stripeWebhook = onRequest(
  { region: "asia-northeast1", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      res.status(500).send("Webhook secret not configured");
      return;
    }

    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      res.status(400).send("No signature");
      return;
    }

    let event: Stripe.Event;
    try {
      // Firebase Cloud Functions v2 provides rawBody as Buffer
      const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).send("Invalid signature");
      return;
    }

    console.log(`Processing Stripe event: ${event.type}`);

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error("Error handling webhook event:", error);
    }

    res.status(200).json({ received: true });
  }
);

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const lineUserId = session.metadata?.lineUserId;
  if (!lineUserId) {
    console.error("No lineUserId in session metadata");
    return;
  }

  console.log(`Checkout completed for user: ${lineUserId}`);

  const subscription = session.subscription as string;
  const customerId = session.customer as string;

  await db().collection("users").doc(lineUserId).update({
    "subscription.status": "active",
    "subscription.stripeCustomerId": customerId,
    "subscription.stripePriceId": process.env.STRIPE_PRICE_ID || null,
  });

  if (subscription) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subscription);
    await db()
      .collection("users")
      .doc(lineUserId)
      .update({
        "subscription.currentPeriodEnd":
          admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
      });
  }

  console.log(`Subscription activated for user: ${lineUserId}`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const lineUserId = subscription.metadata?.lineUserId;
  if (!lineUserId) return;

  // cancel_at_period_end=true の場合は期間末まで有効だが解約予定
  const status = subscription.cancel_at_period_end
    ? "canceling"
    : subscription.status === "active"
      ? "active"
      : "past_due";

  const currentPeriodEnd =
    subscription.current_period_end != null
      ? admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000)
      : null;

  // cancel_at_period_end=true の場合は current_period_end が解約日
  const cancelAtSeconds =
    subscription.cancel_at ?? (subscription.cancel_at_period_end ? subscription.current_period_end : null);
  const cancelAt =
    cancelAtSeconds != null
      ? admin.firestore.Timestamp.fromMillis(cancelAtSeconds * 1000)
      : null;

  await db()
    .collection("users")
    .doc(lineUserId)
    .update({
      "subscription.status": status,
      "subscription.currentPeriodEnd": currentPeriodEnd,
      "subscription.cancelAt": cancelAt,
    });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const lineUserId = subscription.metadata?.lineUserId;
  if (!lineUserId) return;

  await db().collection("users").doc(lineUserId).update({
    "subscription.status": "canceled",
    "subscription.currentPeriodEnd": null,
  });
}

export async function createCheckoutSession(
  lineUserId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID is not set");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?success=true`,
    cancel_url: `${returnUrl}?canceled=true`,
    metadata: { lineUserId },
    subscription_data: {
      metadata: { lineUserId },
    },
  });

  return session.url || "";
}

export async function createCustomerPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}
