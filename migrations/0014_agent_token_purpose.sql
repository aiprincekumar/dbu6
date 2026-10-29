-- dbu6 recognised the tokens it minted for coding agents by their name, which
-- began with "dbu6 agent env"; it now does by `purpose`. The tokens already
-- here that it minted are marked so, and the next one it writes revokes them
-- as before. A token a person named the same way in the app is marked too:
-- nothing in the row tells the two apart, and the old rule revoked it anyway.
ALTER TABLE `personalAccessToken` ADD `purpose` text;--> statement-breakpoint
UPDATE `personalAccessToken` SET `purpose` = 'coding-agent' WHERE `name` GLOB 'dbu6 agent env*';
