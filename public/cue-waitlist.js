(() => {
  const form = document.querySelector("#waitlist-form");
  const email = document.querySelector("#waitlist-email");
  const website = document.querySelector("#waitlist-website");
  const status = document.querySelector("#signup-status");
  const button = form?.querySelector("button");
  if (!form || !email || !website || !status || !button) return;
  let pending = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    button.disabled = true;
    email.disabled = true;
    form.setAttribute("aria-busy", "true");
    button.textContent = "Joining...";
    status.textContent = "";
    status.className = "signup-status";
    status.setAttribute("role", "status");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.value.trim(),
          website: website.value,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true)
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "We couldn't save your email. Please try again.",
        );
      status.textContent =
        "You’re on the list. We’ll email you when early access is ready.";
      status.className = "signup-status success";
      button.textContent = "You’re on the list ✓";
      form.classList.add("joined");
    } catch (error) {
      pending = false;
      email.disabled = false;
      button.disabled = false;
      button.textContent = "Join the waitlist ↗";
      status.textContent =
        error instanceof Error
          ? error.message
          : "We couldn't save your email. Please try again.";
      status.className = "signup-status error";
      status.setAttribute("role", "alert");
    } finally {
      form.removeAttribute("aria-busy");
    }
  });
})();
