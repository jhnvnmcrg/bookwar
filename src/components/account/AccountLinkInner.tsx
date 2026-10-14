import { Link } from "@tanstack/react-router";
import { useAccount } from "#/hooks/useAccount";

/** "Sign in", or the signed-in wizard's name. */
export default function AccountLinkInner() {
	const account = useAccount();
	if (account.status === "off" || account.status === "loading") return null;
	return (
		<Link
			to="/account"
			className="text-gold-bright underline-offset-4 hover:underline"
		>
			{account.status === "guest"
				? "Sign in"
				: (account.nickname ?? "Your account")}
		</Link>
	);
}
