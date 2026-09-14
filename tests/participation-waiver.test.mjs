import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const approvedTitle = "Participation Waiver and Release";
const approvedIntroduction = "In consideration of the opportunity provided by Goodwin Company (“Goodwin”) to participate in its events, I hereby voluntarily state, represent and agree as follows:";
const approvedSections = [
  ["Voluntary Participation", "I agree that participation in any race, marathon, segment or related activity (“Run with Will”) is voluntary."],
  ["Nature of the Activity", "I may volunteer to participate for any part of Run with Will, including the first 5K where offered. I understand availability may vary by location and operational needs, and that details of, and amenities offered, at Run with Will, may change for any time or any reason. Timing, location, route, and participation availability may change or be canceled due to safety, weather, logistics, travel, or operational considerations."],
  ["Inherent Risks", "I recognize that participation in Run with Will is a potentially hazardous activity and I willingly assume all risks associated with such participation, including but not limited to, running and participating around public roads, weather, crowds, transportation, and even activity involve inherent risks, including injury, illness, traffic exposure, uneven surfaces, dehydration, and changing conditions."],
  ["Health and Fitness Responsibility", "I agree not to enter or participate in Run with Will unless I am healthy, medically able and properly trained and agree that it is my responsibility to consult with a physician prior to my participating in Run with Will to determine if I am medically able to participate in Run with Will. I agree to abide by any decision of Run with Will official relative to my ability to safely complete Run with Will."],
  ["Medical Authorization", "I grant the Releasees (as defined below) and their designees permission to administer or arrange for any medical assistance that they deem necessary or appropriate as a result of my participation in Run with Will, including without limitation, arranging transportation to a hospital or other medical facility."],
  ["Event Instructions", "I understand and acknowledge that I must follow organizer, event, venue, safety, and local-authority instructions."],
  ["Emergency Situations", "I understand and acknowledge that I shall follow directions from organizers and local authorities during emergency situations and contact emergency services when urgent help is needed."],
  ["Participant Conduct", "I understand and acknowledge that I must behave respectfully, lawfully, and safely, and must not interfere with event operations, other participants, or the public."],
  ["Photography / Video / Media", "I grant permission to Goodwin to use, publish or license or authorize others to use, publish or license any photographs, motion pictures, video or sound recordings, and/or any other record of my participation in Run with Will, including, but not limited to portrait, picture, likeness, image and/or personal information, such as name, age, gender, domicile, for any purpose without remuneration."],
  ["Personal Belongings", "I accept sole responsibility for my own personal belongings, and I release the Releasees (as defined below) from any liability for the loss, misplacement, misappropriation, theft, or robbery of such belongings."],
  ["Release / Waiver", "Having read this Participation Waiver and Release and knowing these facts, and in consideration of my participation in Run with Will, I, for myself and anyone entitled to act on my behalf, do hereby waive, release, discharge, hold harmless, and covenant not to sue (a) Goodwin Company; (b) all sponsors and officials of Run with Will; (c) the employees, and volunteers, including medical volunteers; and (d) all owners and lessors of premises, or jurisdictions, on or in which Run with Will takes place, and other representatives, agents, officials, and successors (as applicable) of each of the foregoing (the “Releasees”), from any and all present and future claims and liabilities of any kind, known or unknown, arising out of my participation in Run with Will, even though such claim or liability may arise out of negligence or fault on the part of any of the Releasees."],
  ["Class / Collective Waiver", "I hereby agree that all claims must be pursued on an individual basis only. By signing this agreement, I hereby waive my right to commence, or be a party to, any class or collective claims or to bring jointly any claim against the Releasees with any other person."],
  ["Governing Law", "All matters arising out of or relating to this Participation Waiver and Release shall be governed by and construed in accordance with the internal laws of the State of Delaware without giving effect to any choice or conflict of law provision or rule (whether of the State of Delaware or any other jurisdiction). Any claim or cause of action arising under this Participation Waiver and Release may be brought only in the federal and state courts located in New Castle County, Delaware and I hereby consent to the exclusive jurisdiction of such courts."],
  ["Contact", "Contact Team Goodwin at run@teamgoodwin.com."],
  ["Acknowledgement of Understanding", "I HEREBY CONFIRM THAT I AM EIGHTEEN (18) YEARS OF AGE OR OLDER (OR THAT I WILL BE THAT AGE ON THE DATE OF RUN WITH WILL), THAT I HAVE READ THIS PARTICIPATION WAIVER AND RELEASE, AND I FULLY UNDERSTAND ITS TERMS AND CONDITIONS AND UNDERSTAND THAT I AM GIVING UP SUBSTANTIAL RIGHTS, INCLUDING MY RIGHT TO BRING ACTIONS AGAINST THE RELEASEES. I ACKNOWLEDGE THAT I AM AGREEING TO THE WAIVER/RELEASE FREELY AND VOLUNTARILY, AND THAT I INTEND BY CHECKING “I AGREE” TO COMPLETELY AND UNCONDITIONALLY RELEASE THE RELEASEES TO THE FULLEST EXTENT ALLOWED BY LAW."],
];

function decodeHtml(text) {
  return text
    .replaceAll("&ldquo;", "“")
    .replaceAll("&rdquo;", "”")
    .replaceAll("&mdash;", "—")
    .replaceAll("&amp;", "&")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function extractApprovedContent(html) {
  const title = html.match(/<h1 id="legal-title">([\s\S]*?)<\/h1>/)?.[1];
  const introduction = html.match(/<p class="legal-intro">([\s\S]*?)<\/p>/)?.[1];
  const sections = [...html.matchAll(/<section class="legal-section"><h2>([\s\S]*?)<\/h2><p(?: class="[^"]+")?>([\s\S]*?)<\/p><\/section>/g)]
    .map((match) => [decodeHtml(match[1]), decodeHtml(match[2])]);
  const documentId = html.match(/<p class="legal-document-id"[^>]*>([\s\S]*?)<\/p>/)?.[1];

  return {
    title: decodeHtml(title ?? ""),
    introduction: decodeHtml(introduction ?? ""),
    sections,
    documentId: decodeHtml(documentId ?? ""),
  };
}

for (const relativePath of [
  "../source-html/participation-terms.raw.html",
  "../dist/participation-terms.html",
  "../dist/participation-terms/index.html",
]) {
  test(`${relativePath} matches the approved Participation Waiver and Release`, () => {
    const html = readFileSync(new URL(relativePath, import.meta.url), "utf8");

    assert.deepEqual(extractApprovedContent(html), {
      title: approvedTitle,
      introduction: approvedIntroduction,
      sections: approvedSections,
      documentId: "4130-2765-6557.1",
    });
    assert.match(html, /href="mailto:run@teamgoodwin\.com">run@teamgoodwin\.com<\/a>/);
    assert.doesNotMatch(html, /ATTORNEY|INPUT REQUIRED|legal-placeholder/);
  });
}

test("every existing waiver link preserves the public route", () => {
  const generatedPages = readdirSync(new URL("../dist/", import.meta.url))
    .filter((file) => file.endsWith(".html"));
  const waiverLinks = [];

  assert.ok(generatedPages.length > 0);
  for (const file of generatedPages) {
    const html = readFileSync(new URL(`../dist/${file}`, import.meta.url), "utf8");
    for (const match of html.matchAll(/href="([^"]*participation-terms[^"]*)"/g)) {
      waiverLinks.push({ file, href: match[1] });
    }
  }

  assert.ok(waiverLinks.length > 0);
  assert.deepEqual([...new Set(waiverLinks.map(({ href }) => href))], ["/participation-terms/"]);
});
