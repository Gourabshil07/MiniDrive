document.addEventListener("DOMContentLoaded", () => {

  let hasBackendUsernameError = false;
  let backendUsernameValue = null;
  let userHasTypedUsername = false;

  // PANEL TOGGLE 
  const sign_in_btn = document.querySelector("#sign-in-btn");
  const sign_up_btn = document.querySelector("#sign-up-btn");
  const container = document.querySelector(".container");

  if (sign_up_btn) {
    sign_up_btn.addEventListener("click", () => {
      container.classList.add("sign-up-mode");
    });
  }

  if (sign_in_btn) {
    sign_in_btn.addEventListener("click", () => {
      container.classList.remove("sign-up-mode");
    });
  }

  // SIGNUP VALIDATION 
  const username = document.getElementById("username");
  const password = document.getElementById("password");
  const signupForm = document.getElementById("signupForm");

  const usernameError = document.getElementById("usernameError");
  const passwordError = document.getElementById("passwordError");

  let usernameExists = false;

  function setError(el, msg) {
    el.textContent = msg;
    el.className = "hint error";
  }

  function setSuccess(el, msg) {
    el.textContent = msg;
    el.className = "hint success";
  }

  //  USERNAME LOCAL VALIDATION 
  if (username) {
    username.addEventListener("input", () => {
      userHasTypedUsername = true;

      // remove backend flash when user types
      const signupFlash = document.getElementById("signupFlash");
      if (signupFlash) {
        signupFlash.remove();
      }

      const val = username.value.trim();
      usernameExists = false;

      if (val.length === 0) {
        usernameError.textContent = "";
        usernameError.className = "hint";
        return;
      }

      if (val.length < 3 || val.length > 12) {
        setError(usernameError, "Username must be between 3 and 12 characters");
        return;
      }
      if (/\s/.test(val)) {
        setError(usernameError, "Spaces are not allowed");
        return;
      }
      if (/^[^A-Za-z0-9]/.test(val)) {
         setError(usernameError, "Invalid username");
          return;
      }


      if (!/^[A-Za-z0-9@#&]+$/.test(val)) {
        setError(usernameError, "Invalid username");
        return;
      }

      const specials = val.match(/[@#&]/g) || [];
      if (specials.length > 1) {
        setError(usernameError, "Only one special character allowed");
        return;
      }

      // NOT override backend error until value changes
      if (hasBackendUsernameError) {
        if (val === backendUsernameValue) {
          return; // keep backend error
        }
        hasBackendUsernameError = false;
      }

      if (userHasTypedUsername && !hasBackendUsernameError) {
        setSuccess(usernameError, "Username looks good");
      }
    });

    // detect backend error state on load
    const signupFlash = document.getElementById("signupFlash");
    if (signupFlash) {
      hasBackendUsernameError = true;
      backendUsernameValue = username.value.trim();
    }

    // LIVE USERNAME EXIST CHECK 
    username.addEventListener("blur", async () => {
      const val = username.value.trim();
      if (val.length < 3) return;

      try {
        const res = await fetch(
          `/api/check-username?username=${encodeURIComponent(val)}`
        );
        const data = await res.json();

        if (data.exists) {
          usernameExists = true;
          setError(usernameError, "Username already exists");
        }
      } catch (err) {
        console.error("Username check failed", err);
      }
    });
  }

  // PASSWORD VALIDATION 
  if (password) {
    password.addEventListener("input", () => {
      const val = password.value;

      if (val.length < 4) {
        setError(passwordError, "Minimum 4 characters required");
        return;
      }
      if (!/[A-Za-z]/.test(val)) {
        setError(passwordError, "Must include a letter");
        return;
      }
      if (!/[0-9]/.test(val)) {
        setError(passwordError, "Must include a number");
        return;
      }
      if (!/[@#&!$%^*]/.test(val)) {
        setError(passwordError, "Must include a special character");
        return;
      }

      setSuccess(passwordError, "Password looks strong");
    });
  }

  //  BLOCK INVALID SUBMIT 
  if (signupForm) {
    signupForm.addEventListener("submit", (e) => {

      // prevent fake success on existing username
      if (userHasTypedUsername && !hasBackendUsernameError && !usernameExists) {
        username.dispatchEvent(new Event("input", { bubbles: true }));
      }

      password.dispatchEvent(new Event("input", { bubbles: true }));

      const isUsernameValid =
        usernameError.classList.contains("success") && !usernameExists;

      const isPasswordValid =
        passwordError.classList.contains("success");

      if (!isUsernameValid || !isPasswordValid) {
        e.preventDefault();

        if (usernameExists) {
          setError(usernameError, "Username already exists");
        }

        signupForm.classList.remove("shake");
        void signupForm.offsetWidth;
        signupForm.classList.add("shake");
      }
    });
  }

  // AUTO OPEN SIGNUP IF BACKEND ERROR 
  if (document.querySelector(".flash.error")) {
    container.classList.add("sign-up-mode");
  }

});
