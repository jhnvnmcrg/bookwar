import { useEffect, useState } from "react";
import { loadProfile } from "#/lib/profile";
import { useAccount } from "./useAccount";

/**
 * This browser's profile, kept in step with the account: on a new device, a signed-in
 * player's wizard name arrives with the first sync and replaces the empty local one.
 */
export function useProfile() {
	const [profile, setProfile] = useState(loadProfile);
	const account = useAccount();
	const accountName = account.status === "signed-in" ? account.nickname : null;
	useEffect(() => {
		// The sync has already saved the account's name in this browser.
		if (accountName) setProfile(loadProfile());
	}, [accountName]);
	return [profile, setProfile] as const;
}
