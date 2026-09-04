// The badbroccoli mascot: a broccoli with a mischievous streak — small devil
// horns, slanted eyes, a smirk. Drawn as inline SVG (not an <img>) so it
// inherits currentColor where useful, needs no extra asset request, and
// stays crisp at any size.
export default function BadBroccoliMark({ className }) {
	return (
		<svg
			viewBox="0 0 40 40"
			className={className}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="badbroccoli mascot"
		>
			{/* stem */}
			<path d="M20 37V25.5" stroke="#8a6b3f" strokeWidth="2.6" strokeLinecap="round" />

			{/* florets — layered blobs forming the crown */}
			<circle cx="13" cy="16" r="7" fill="#4f7f3f" />
			<circle cx="27" cy="16" r="7" fill="#4f7f3f" />
			<circle cx="20" cy="10.5" r="7.2" fill="#5c8f4a" />
			<circle cx="20" cy="18" r="8.4" fill="#699c55" />

			{/* devil horns, in the site's clay/primary tone */}
			<path
				d="M14.5 8.5 L11.5 2.5 C13.6 2.9 15.4 4.3 16.3 6.4"
				fill="#c2603f"
			/>
			<path
				d="M25.5 8.5 L28.5 2.5 C26.4 2.9 24.6 4.3 23.7 6.4"
				fill="#c2603f"
			/>

			{/* slanted, mischievous eyes */}
			<path d="M14.5 17.5 L18.5 19.5" stroke="#241f19" strokeWidth="2" strokeLinecap="round" />
			<path d="M25.5 17.5 L21.5 19.5" stroke="#241f19" strokeWidth="2" strokeLinecap="round" />

			{/* smirk */}
			<path
				d="M15 23.5 Q20 27.5 25.5 22.5"
				stroke="#241f19"
				strokeWidth="2"
				strokeLinecap="round"
				fill="none"
			/>
		</svg>
	);
}
