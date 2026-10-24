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

      <h2>Children</h2>
      <p>By default, photo likenesses are turned <b>off</b> for anyone under 18. If the host turns them on for the event, a parent or guardian must agree for each child. Children can always play with no photo and a cartoon character the GM invents.</p>

      <h2>AI guests and voices</h2>
      <p>The host can add AI guests. What you type to them is sent to the AI service the host has configured, along with their character card and the clues everyone has seen, and never other players&apos; secrets. When cloud voices are on, their replies are turned into speech by the host&apos;s cloud voice service. The &quot;Speak&quot; button, offered to grown-ups only, uses your browser&apos;s built-in speech recognition, which may send your voice to the browser&apos;s maker (for example Google or Apple). Children can type but not speak to the AI guests. Chat lines are kept only for the length of the game.</p>

      <h2>Saved and shared stories</h2>
      <p>A host can save a game&apos;s story to share it. The saved mystery is sealed so replayers cannot read the answer. If the host adds a recap, it may show the story, clues, scores and awards. The recap uses character names by default; real names and the game&apos;s pictures are only included for link-only stories when the host chooses them, and never for public stories. Saved stories stay until the host deletes them. Votes are counted without names.</p>

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
