import { NextResponse } from "next/server"
import { Resend } from "resend"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, phone, message, service } = body

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log("Contact form submission (no email sent — RESEND_API_KEY not set):", { name, email, phone, service, message })
      return NextResponse.json({ success: true, message: "Thank you! We'll be in touch within 24 hours." })
    }

    const resend = new Resend(apiKey)

    const emailRes = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "aadnan@techsightinnovation.com",
      subject: `New inquiry from ${name} via TechSight website`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || "—"}`,
        `Service: ${service || "General inquiry"}`,
        ``,
        `Message:`,
        message,
      ].join("\n"),
    })

    console.log("Resend response:", JSON.stringify(emailRes))

    return NextResponse.json({ success: true, message: "Thank you! We'll be in touch within 24 hours." })
  } catch (err) {
    console.error("Contact form error:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
