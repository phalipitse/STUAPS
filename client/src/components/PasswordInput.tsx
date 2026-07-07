import { useState, type InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password <input> with a toggle to reveal/hide what's been typed, so a user can check it before submitting. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
