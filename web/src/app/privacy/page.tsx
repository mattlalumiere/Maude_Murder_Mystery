export const metadata = { title: "Privacy notice | Murder Mystery Night" };

export default function Privacy() {
  return (
    <main>
      <h1>Privacy notice</h1>
      <p className="muted">Plain-language summary for players and parents. This is not legal advice; the host should adapt it to their own event.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Your name and age group</b>, so we can give you a suitable character.</li>
        <li><b>Backstory ideas</b> you type, shown on your own card (and to the AI that writes the story).</li>
        <li><b>An optional photo</b>, only if you choose to add one and agree to the consent box.</li>
      </ul>

      <h2>What we do with a photo</h2>
      <ul>
        <li>Hidden location and camera details are removed from the file on our server.</li>
        <li>When the host has turned it on, it is checked by an automated safety service, and if it passes it is used only as a reference so an AI image service can draw a <b>cartoon look-alike</b> of your character.</li>
        <li>Your original photo is <b>never shown to other players</b>. Only the cartoon pictures appear on phones and the TV.</li>
        <li>Photos are meant to be deleted within 24 hours (the host&apos;s setup should enforce this), or sooner when the host or you delete them. The cartoon pictures expire with the game.</li>
      </ul>

      <h2>Adults-only games</h2>
      <p>A host can run an adults-only game with crude, dark humor. The host confirms that everyone playing is 18 or older, and no one under 18 can join that game. It is still fiction: there is no sexual abuse or violence, nothing involving minors, and no real people.</p>

      <h2>Selfie booth</h2>
      <ul>
        <li>A selfie is used as a reference to make a funny AI picture (a wanted poster, a film noir detective, and so on). It is stripped of hidden details and safety-checked. Your original is kept only so you can redo the picture, is <b>never shown</b>, and is deleted when you delete your pictures, if you leave the game, and at the reveal at the latest. You can delete any picture, or your portrait, at any time and ask for a new one.</li>
        <li>The funny picture is shown to everyone in the game and on the TV, and expires with the game. Your original selfie is never shown. Names are never sent to the image service.</li>
        <li>Selfies are off for anyone under 18 unless the host turned photo likenesses on for the event and a parent or guardian agrees.</li>
      </ul>

      <h2>Children</h2>
      <p>By default, photo likenesses are turned <b>off</b> for anyone under 18. If the host turns them on for the event, a parent or guardian must agree for each child. Children can always play with no photo and a cartoon character the GM invents.</p>

      <h2>AI guests and voices</h2>
      <p>The host can add AI guests. What you type to them is sent to the AI service the host has configured, along with their character card and the clues everyone has seen, and never other players&apos; secrets. When cloud voices are on, their replies are turned into speech by the host&apos;s cloud voice service. The &quot;Speak&quot; button, offered to grown-ups only, uses your browser&apos;s built-in speech recognition, which may send your voice to the browser&apos;s maker (for example Google or Apple). Children can type but not speak to the AI guests. The table chat is readable by everyone in the game and is kept only for the length of the game. Voice calls use the same speech services as the Speak button, so they follow the same rules: grown-ups only. Chat lines are kept only for the length of the game.</p>

      <h2>Saved and shared stories</h2>
      <p>A host can save a game&apos;s story to share it. The saved mystery is sealed so replayers cannot read the answer. If the host adds a recap, it may show the story, clues, scores and awards. The recap uses character names by default; real names and the game&apos;s pictures are only included for link-only stories when the host chooses them, and never for public stories. Saved stories stay until the host deletes them. Votes are counted without names.</p>

      <h2>Local AI mode</h2>
      <p>If the host chose local AI services, chat, voices, pictures and video are produced by software running on the host&apos;s own computer, and photos and voice recordings are not sent to a cloud service for that game. Voice input in this mode is recorded for a few seconds, transcribed locally, and discarded.</p>

      <h2>Heavy drinking night</h2>
      <p>If the host chose the heavy drinking night, grown-ups can opt in with a personal limit. Your choice and your self-reported drink count are stored for the length of the game, shown only to you and the host, and never on the shared screen. Children and teenagers are never part of it. This is not medical advice: eat, drink water, and do not drive.</p>

      <h2>Who else sees your data</h2>
      <p>Your text and photo are sent to the AI and cloud services the host has configured for this game (for example AWS Bedrock, Rekognition, and S3) only to run the game. We do not sell data or use it to train models.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Skip the photo, or remove it at any time from your player page.</li>
        <li>Ask the host to delete all photos from the host console.</li>
        <li>Say &quot;Pass&quot; to any dare or question during the game.</li>
      </ul>
    </main>
  );
}
