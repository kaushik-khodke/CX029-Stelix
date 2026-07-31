import os
import stripe
from fastapi import HTTPException
from supabase import create_client

import asyncio

def _get_sb():
    return create_client(
        os.getenv("VITE_SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    )

def _create_stripe_checkout_sync(order_id: str, success_url: str, cancel_url: str):
    """
    Synchronous helper to create a Stripe checkout session without blocking event loop.
    """
    sb = _get_sb()
    # Fetch order details
    order_res = (
        sb.table("orders")
        .select("id, status, order_items(qty, medicines(name, price_rec))")
        .eq("id", order_id)
        .single()
        .execute()
    )
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Order not found")
    order = order_res.data

    line_items = []
    for item in order["order_items"]:
        med = item["medicines"]
        # Convert price to cents. Default to 10.00 if N/A
        price_amount = min(max(1, int(float(med.get("price_rec") or 10.00) * 100)), 999999)
        line_items.append({
            "price_data": {
                "currency": "usd",
                "product_data": {
                    "name": med["name"],
                },
                "unit_amount": price_amount,
            },
            "quantity": item["qty"],
        })

    if not line_items:
        raise HTTPException(status_code=400, detail="No valid items in order to checkout")

    if not stripe.api_key:
        print("Payment Service: Stripe API Key is missing. Generating mock URL.")
        # Fallback mock
        mock_url = f"{success_url}?session_id=mock_session_123&order_id={order_id}"
        return {"success": True, "url": mock_url}

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=line_items,
            mode="payment",
            # Encode BOTH session_id and order_id in success URL so frontend can pass both back
            success_url=success_url + "?session_id={CHECKOUT_SESSION_ID}&order_id=" + order_id,
            cancel_url=cancel_url,
            client_reference_id=order_id
        )
        return {"success": True, "url": session.url}
    except Exception as e:
        print(f"Payment Service Error: {e}")
        return {"success": False, "error": str(e)}

async def _create_stripe_checkout(order_id: str, success_url: str, cancel_url: str):
    """
    Asynchronous wrapper for the Stripe SDK and Supabase network requests.
    """
    return await asyncio.to_thread(_create_stripe_checkout_sync, order_id, success_url, cancel_url)
