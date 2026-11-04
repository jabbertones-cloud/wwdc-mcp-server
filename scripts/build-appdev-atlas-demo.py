from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math
from subprocess import run
root=Path("website")
frames=root/".demo-frames"
frames.mkdir(exist_ok=True)
font_regular="/System/Library/Fonts/Supplemental/Arial.ttf"
font_bold="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
slides=[
("AppDev Atlas","Independent research for Apple-platform developers","Search public source material with cited evidence."),
("Research, not guesswork","Conference sessions, API documentation, design guidance, Swift Evolution, and review guidelines.","Use references before changing code."),
("45 read-only tools","Search and analyze public material without Apple account access.","No app submissions or account changes."),
("1  Check source freshness","wwdc_ingest_status","Inspect index coverage before trusting a result."),
("2  Search published sessions","wwdc_search","Find relevant sessions, titles, years, and citations."),
("3  Check review guidelines","appstore_guidelines_search","Retrieve matching guideline sections and source links."),
("4  Audit your app's features","swift_app_audit","Compare implementation choices with published guidance."),
("Use your MCP client","Connect to the existing read-only endpoint.","https://wwdc-mcp.smatdesigns.com/mcp"),
("Independent by SMAT Designs","Not affiliated with or endorsed by Apple or OpenAI.","AppDev Atlas  |  app research with sources")
]
icon=Image.open("openai-public-plugin/assets/icon.png").convert("RGBA")
W,H=1280,720
def font(pt,bold=False):
 return ImageFont.truetype(font_bold if bold else font_regular, pt)
def wrap(d,txt,maxw,fnt):
 result=[]
 for paragraph in txt.split("\n"):
  line=""
  for word in paragraph.split(" "):
   candidate=(line+" "+word).strip()
   if line and d.textbbox((0,0),candidate,font=fnt)[2]>maxw:
    result.append(line);line=word
   else:line=candidate
  result.append(line)
 return result
for i,(heading,body,detail) in enumerate(slides,1):
 im=Image.new("RGB",(W,H),(9,17,38))
 d=ImageDraw.Draw(im)
 for y in range(H):
  t=y/H
  d.line((0,y,W,y),fill=(int(7+18*t),int(20+3*t),int(43+40*t)))
 d.ellipse((780,-320,1500,390),fill=(24,40,90))
 d.ellipse((980,310,1700,970),fill=(27,20,71))
 d.rounded_rectangle((51,42,1229,680),radius=30,outline=(48,67,107),width=2)
 d.rectangle((85,89,94,130),fill=(52,211,252))
 small=icon.resize((85,85),Image.Resampling.LANCZOS)
 im.paste(small,(100,75),small)
 d.text((205,94),"APPDEV ATLAS",font=font(26,True),fill=(173,210,255))
 d.text((90,206),heading,font=font(59,True),fill=(244,250,255))
 for j,line in enumerate(wrap(d,body,1055,font(38))):
  d.text((90,310+55*j),line,font=font(38),fill=(205,226,247))
 d.rounded_rectangle((90,520,1190,593),radius=15,fill=(17,40,77),outline=(45,102,150),width=2)
 detail_size=27 if len(detail)<74 else 23
 d.text((113,541),detail,font=font(detail_size),fill=(126,233,254))
 d.line((90,645,1190,645),fill=(41,80,121),width=2)
 d.text((90,654),"Independent developer research  •  read-only",font=font(17),fill=(143,167,200))
 page=f"{i:02d}.png"
 im.save(frames/page)
with (frames/"concat.txt").open("w") as f:
 for i in range(1,len(slides)+1):
  f.write(f"file '{i:02d}.png'\nduration 3.333333\n")
 f.write("file '09.png'\n")
print("demo frames",len(slides))
