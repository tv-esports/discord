import { EmbedBuilder, Message } from "discord.js";
import { ExtendedClient } from "../structures/Client";
import { BaseEvent } from "../structures/Event";

import UserModel from "../models/user/user";
import GuildModel from "../models/guild/guild";

import { generateRandomXP, prestigeLevelRoles, randomGif, levelRoles } from "../functions/xp";

export default class MessageEvent extends BaseEvent {
  constructor() {
    super("messageCreate");
  }

  async run(client: ExtendedClient, message: Message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildQuery = await GuildModel.findOne({ guildID: message.guild.id });
    let userQuery = await UserModel.findOne({ userID: message.author.id });

    // If userQuery is null (user not found in database), create a new user
    if (!userQuery) {
      userQuery = await UserModel.create({
        userID: message.author.id,
        xp_level: 0,
        xp_points: 0,
        warnings: 0,
        prestige: {
          is_prestige: false,
          prestige_level: 0,
          prestige_xp: 0,
          prestige_insertedAt: new Date(),
          prestige_updatedAt: new Date(),
        },
        inserted_at: new Date(),
        updated_at: new Date(),
      });
    }

    const isPrestige = userQuery.prestige?.is_prestige || false;

    if (!guildQuery) return;
    if (guildQuery.xp_enabled === false) return;
    if (guildQuery.blacklisted_xp_users.includes(message.author.id)) return;
    if (guildQuery.ignored_xp_channels.includes(message.channel.id)) return;
    if (guildQuery.ignored_xp_roles.some((role) => message.member?.roles.cache.has(role))) return;

    // return if the user is already level 50
    if (userQuery.xp_level === 50) return;
    if (isPrestige && userQuery.prestige?.prestige_level === 10) return;

    const cooldowns = new Map();
    let cooldownTime = 10000;

    const currentTime = Date.now();
    const userCooldown = cooldowns.get(message.author.id);

    const prestigeUpdatedAt = userQuery.prestige?.prestige_updatedAt;
    const isPrestigeUpdated = prestigeUpdatedAt ? (currentTime - prestigeUpdatedAt.getTime()) > (1000 * 60 * 60 * 3) : false;

    const today = new Date();
    const dayOfWeek = today.getDay(); // Returns the day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)

    // Check if it's Saturday (6) or Sunday (0)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Calculate XP based on whether it's the weekend or not or the user is in prestige mode (prestige users get 0.5x xp)
    //                                  weekend * 2                  not weekend
    let XP_TO_GIVE = isWeekend ? generateRandomXP(4, 8) : generateRandomXP(2, 4);

    // User is on cooldown, ignore message
    if (userCooldown && (currentTime - userCooldown) < cooldownTime) return;

    cooldowns.set(message.author.id, currentTime);

    if (!isPrestige) {
      const newXP = userQuery.xp_points + XP_TO_GIVE;
      let userLevel = userQuery.xp_level;

      for (const levelRole of levelRoles) {
        if (newXP >= levelRole.xpRequired && levelRole.level > userLevel) {
          const role = message.guild.roles.cache.find((r) => r.id === levelRole.role);

          if (role && message.member?.roles.cache.has(role.id)) {
            const levelUpEmbed = new EmbedBuilder()
              .setColor("Random")
              .setDescription(`🎉 Congratulations, you have leveled up!\nYou are now level \`${levelRole.level}\``)
              .setTimestamp();
            message.reply({ content: `${message.author}`, embeds: [levelUpEmbed] });
          }

          if (role && !message.member?.roles.cache.has(role.id)) {
            const levelUpEmbed = new EmbedBuilder()
              .setColor("Random")
              .setDescription(`🎉 Congratulations, you have leveled up!\nYou are now level \`${levelRole.level}\` and received the \`${role.name}\` role`)
              .setTimestamp();
            message.member?.roles.add(role);
            message.reply({ content: `${message.author}`, embeds: [levelUpEmbed] });
          }

          userLevel = levelRole.level;
        }
      }

      await UserModel.findOneAndUpdate(
        { userID: message.author.id },
        { xp_points: newXP, xp_level: userLevel }
      );
    }

    // prestige earnings
    if (isPrestige && isPrestigeUpdated) {
      const prestigeEarnings = generateRandomXP(1, 3);

      const newXP = userQuery.prestige?.prestige_xp + prestigeEarnings;
      let prestigeLevel = userQuery.prestige?.prestige_level;

      for (const prestigeLevelRole of prestigeLevelRoles) {
        if (newXP >= prestigeLevelRole.xpRequired && prestigeLevelRole.prestige_level > prestigeLevel) {

          message.react("🏴‍☠️")

          prestigeLevel = prestigeLevelRole.prestige_level;
        }
      }

      await UserModel.findOneAndUpdate(
        { userID: message.author.id },
        { "prestige.prestige_xp": newXP, "prestige.prestige_level": prestigeLevel, "prestige.prestige_updatedAt": new Date() }
      );
    }
  }
}