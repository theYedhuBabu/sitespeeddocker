/**
 * @param {import('browsertime').BrowsertimeContext} context
 * @param {import('browsertime').BrowsertimeCommands} commands
 */
export default async function (context, commands) {
  context.log.info('Start to measure my first URL');
  return commands.measure.start('https://www.sitespeed.io');
}