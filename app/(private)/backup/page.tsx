import { getOwnerAccess } from "@/lib/auth";

export default async function BackupPage() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;

  return (
    <section className="space-y-5">
      <div>
        <p className="kicker">DATA EXPORT</p>
        <h1 className="mt-2 text-3xl font-bold">내 데이터 내보내기</h1>
        <p className="muted mt-3 text-sm leading-6">
          현재 로그인한 계정의 모드 카탈로그, Mod ID, 조사 원본, 서버 프로필과 구성,
          영구 대기함을 JSON 파일로 내보냅니다.
        </p>
      </div>
      <div className="panel space-y-4 p-5">
        <p className="text-sm">
          이 기능은 데이터를 읽기만 하며 DB·게임 서버·실제 설정 파일을 변경하지 않습니다.
        </p>
        <a href="/api/data-export" className="action inline-flex text-center text-sm">
          JSON 데이터 내보내기
        </a>
        <p className="muted text-xs leading-5">
          대기함 DB가 아직 준비되지 않은 경우 내려받는 JSON에 complete: false와
          누락 사유가 표시됩니다. 이런 파일을 전체 백업으로 취급하지 마세요.
          복구·가져오기는 안전성 검증 전까지 제공하지 않습니다.
        </p>
      </div>
    </section>
  );
}
