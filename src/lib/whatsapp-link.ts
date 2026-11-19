export function buildWhatsAppSendUrl(
  rawPhoneInput: string | null | undefined,
  message: string
): string {
  const digits = (rawPhoneInput || "").replace(/[^0-9]/g, "");
  const waDigits =
    digits.length === 10 ? `91${digits}` : digits.length >= 10 ? digits : "";
  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const encoded = encodeURIComponent(message);
  if (isMobile) {
    return waDigits
      ? `https://wa.me/${waDigits}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
  }
  return waDigits
    ? `https://web.whatsapp.com/send?phone=${waDigits}&text=${encoded}`
    : `https://web.whatsapp.com/send?text=${encoded}`;
}
